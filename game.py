import os
import random
from typing import Sized
from enum import Enum
from bidict import bidict

import flask_socketio as sio

import time

import config
import threading

from google import genai
from dotenv import load_dotenv

load_dotenv()

client = genai.Client(api_key=os.getenv("GEMINI_KEY"))


class GameState(Enum):
    WAITING = 0,
    GET_QUESTION = 1,
    ANSWER_QUESTION = 2,
    VOTING = 3


class Game:
    def __init__(self):
        self.players: list[str] = []
        self.questions: dict[str, str] = {}  # key: sid, value: question
        self.responses: dict[str, str] = {}  # key: sid, value: response
        self.votes: dict[str, int] = {}  # key: sid, value: the player's vote
        self.sid_to_player_id: bidict[str, int] = bidict()
        self.player_id = 0
        self.total_votes: [str, int] = {}  # Key: sid, value: accumulated votes for that player
        self.running = False
    
    def _emit_all(self, event: str, *args):
        for player in self.players:
            sio.emit(event, args, to=player)
            
    def _get_question(self):
        questions_list = list(self.questions.items())
        random.shuffle(questions_list)
        
        del self.questions[questions_list[0][0]]
        return questions_list[0][1]
    
    def add_question(self, sid: str, question: str):
        self.questions[sid] = question
    
    def add_response(self, sid: str, response: str):
        self.responses[sid] = response
    
    def add_vote(self, sid: str, vote: int):
        self.votes[sid] = vote
    
    def _gen_ai_response(self, question: str):
        response = client.models.generate_content(
            model="gemini-2.5-flash-preview-04-17", contents=config.PROMPT.replace("{{QUESTION}}", question)
        )
        
        self.add_response("ai", response.text)
    
    def _collect_responses(self):
        player_id_and_response = [
            (self.sid_to_player_id[sid], response)
            for sid, response in self.responses.items()
        ]
        
        return sorted(player_id_and_response, key=lambda x: x[0])
    
    def _wait_response(self, countdown: float, response_field: Sized, count_ai: bool = False) -> None:
        target_players = len(self.players) - (0 if count_ai else 1)  # AI is counted as a player
        
        start_time = time.monotonic()
        while time.monotonic() - start_time < countdown and len(response_field) < target_players:
            time.sleep(0.1)
    
    def _shuffle_ids(self):
        player_sids = list(self.sid_to_player_id.keys())
        player_ids = list(self.sid_to_player_id.values())
        
        random.shuffle(player_ids)
        
        # Clear the bidict to avoid duplication errors
        self.sid_to_player_id.clear()
        
        for sid, player_id in zip(player_sids, player_ids):
            self.sid_to_player_id[sid] = player_id
    
    def run(self):
        self.running = True

        self.questions = {}
        self._emit_all("question-prompt", config.QUESTION_PROMPT_TIME)
        self._wait_response(config.QUESTION_PROMPT_TIME, self.questions)

        if "ai" not in self.players:
            self.add_player("ai")

        while self.questions:
            # Shuffle IDs for every vote so players can't determine the AI one round then vote the same every round
            self._shuffle_ids()
            
            # Ask question and get responses
            self.responses = {}
            question = self._get_question()
            self._emit_all("answer-question", config.ANSWER_QUESTION_TIME, question)

            # Start thread for AI to answer the question
            ai_response_thread = threading.Thread(target=self._gen_ai_response, args=(question,))
            ai_response_thread.start()
            self._wait_response(config.ANSWER_QUESTION_TIME, self.responses, count_ai=True)
            ai_response_thread.join()

            for sid in self.players:
                if sid not in self.responses:
                    self.responses[sid] = "Player did not respond in time"

            # Vote on the AI
            self._emit_all("vote", config.VOTING_TIME, self._collect_responses())
            self.votes = {}
            self._wait_response(config.VOTING_TIME, self.votes)

            # Register votes
            for sid, vote in self.votes.items():
                try:
                    vote = int(vote)
                except ValueError:  # Invalid vote
                    continue

                if self.sid_to_player_id[sid] == vote:  # Cannot vote for yourself
                    continue

                if vote not in self.sid_to_player_id.inv:  # Player that is voted for does not exist
                    continue

                vote_sid = self.sid_to_player_id.inv[vote]
                self.total_votes[vote_sid] = self.total_votes.get(vote_sid, 0) + 1

        self._emit_all("end", sorted(list(self.total_votes.items()), key=lambda x: x[1], reverse=True), self.sid_to_player_id["ai"])

        time.sleep(10)
        self._emit_all("waiting-room")
        self.running = False
    
    def add_player(self, sid: str):
        self.player_id += 1
        self.sid_to_player_id[sid] = self.player_id
        self.players.append(sid)
    
    def remove_player(self, sid: str):
        del self.sid_to_player_id[sid]
        self.players.remove(sid)
    
    def update_player_count(self):
        self._emit_all("players", len(self.players))
    