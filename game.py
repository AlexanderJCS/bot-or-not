import os
import random
from typing import Sized
from enum import Enum

import google.genai.errors
from bidict import bidict

import flask_socketio as sio

import time

import config
import threading

from google import genai
from dotenv import load_dotenv

from strutils import truncate

load_dotenv()


class GameState(Enum):
    WAITING = 0,
    GET_QUESTION = 1,
    ANSWER_QUESTION = 2,
    VOTING = 3


class Game:
    def __init__(self, game_code: str):
        self.api_key_names = ["GEMINI_KEY", "GEMINI_KEY_2"]
        self.current_key_name = self.api_key_names[0]
        self.client = genai.Client(api_key=os.getenv(self.current_key_name))
        
        self.game_code = game_code
        
        self.players: list[str] = []
        self.questions_and_style: dict[str, dict[str, str]] = {}  # key: sid, value: question
        self.responses: dict[str, str] = {}  # key: sid, value: response
        self.votes: dict[str, int] = {}  # key: sid, value: the player's vote
        self.sid_to_player_id: bidict[str, int] = bidict()
        self.sid_to_name: dict[str, str] = {}
        self.player_id = 0
        self.total_votes: [str, int] = {}  # Key: sid, value: accumulated votes for that player
        self.running = False
    
    def num_players(self):
        return len(self.players)
    
    def _emit_all(self, event: str, *args):
        # TODO: improve performance by "bulk emitting" -- read docs to see how that's done
        for player in self.players:
            if player == "ai":
                continue
            
            sio.emit(event, args, to=player)
            
    def _get_question(self):
        questions_list = list(self.questions_and_style.items())
        random.shuffle(questions_list)
        
        del self.questions_and_style[questions_list[0][0]]
        return questions_list[0][1]
    
    def add_question(self, sid: str, question: str, style: str):
        self.questions_and_style[sid] = {
            "question": truncate(question, config.CHAR_LIMIT),
            "style": style
        }
    
    def add_response(self, sid: str, response: str):
        self.responses[sid] = truncate(response, config.CHAR_LIMIT)
        
    def add_vote(self, sid: str, vote: int):
        self.votes[sid] = vote
    
    def _gen_ai_response(self, question: str, style: str):
        for _ in range(len(self.api_key_names)):
            try:
                response = self.client.models.generate_content(
                    model="gemini-2.5-flash", contents=config.PROMPT.replace("{{QUESTION}}", question).replace("{{STYLE}}", style)
                )
            except google.genai.errors.ClientError:
                print("Swapping API keys")
                # Try again with a different API key
                next_key_index = (self.api_key_names.index(self.current_key_name) + 1) % len(self.api_key_names)
                self.client = genai.Client(api_key=os.getenv(self.api_key_names[next_key_index]))
                continue
            break
        
        else:  # All API keys failed
            self.add_response("ai", "AI failed to generate a response")
            return
        
        self.add_response("ai", response.text)
    
    def _collect_responses(self):
        player_id_and_response = [
            (self.sid_to_player_id[sid], response)
            for sid, response in self.responses.items()
            if sid in self.sid_to_player_id
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
    
    def _collect_results(self):
        sid_votes_pairs = sorted(list(self.total_votes.items()), key=lambda x: x[1], reverse=True)
        
        humans_win = len(sid_votes_pairs) > 0 and sid_votes_pairs[0][0] == "ai"
        
        # Convert SID -> votes to name -> votes
        # After doing this the variable becomes a misnomer but oh well
        for i, (sid, votes) in enumerate(sid_votes_pairs):
            name = self.sid_to_name.get(sid, "Player left")
            sid_votes_pairs[i] = (name, votes)
        
        return sid_votes_pairs, humans_win
    
    def run(self):
        self.running = True

        if "ai" not in self.players:
            self.add_player("ai", "Bot")

        self.questions_and_style = {}
        self._emit_all("question-prompt", config.QUESTION_PROMPT_TIME)
        self._wait_response(config.QUESTION_PROMPT_TIME, self.questions_and_style)

        while self.questions_and_style:
            # Shuffle IDs for every vote so players can't determine the AI one round then vote the same every round
            self._shuffle_ids()
            
            # Notify the players what ID they are
            for sid, player_id in self.sid_to_player_id.items():
                sio.emit("your-player-id", player_id, to=sid)
            
            # Ask question and get responses
            self.responses = {}
            question_and_style = self._get_question()
            question, style = question_and_style["question"], question_and_style["style"]
            
            self._emit_all("answer-question", config.ANSWER_QUESTION_TIME, question, style)

            # Start thread for AI to answer the question
            ai_response_thread = threading.Thread(target=self._gen_ai_response, args=(question, style))
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

        self._emit_all("end", *self._collect_results(), config.RESULTS_SCREEN_TIME)
        time.sleep(config.RESULTS_SCREEN_TIME)
        self._emit_all("waiting-room")
        self.running = False
    
    def add_player(self, sid: str, name: str):
        self.player_id += 1
        self.sid_to_player_id[sid] = self.player_id
        self.sid_to_name[sid] = truncate(name, config.NAME_CHAR_LIMIT)
        self.players.append(sid)
        
        sio.emit("game-status", self.running, to=sid)
    
    def remove_player(self, sid: str):
        del self.sid_to_player_id[sid]
        del self.sid_to_name[sid]
        self.players.remove(sid)
    
    def update_player_count(self):
        self._emit_all("players", len(self.players), list(self.sid_to_name.values()))
    