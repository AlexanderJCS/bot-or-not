import random
from enum import Enum
from bidict import bidict

import flask_socketio as sio

import time
import ollama

import config
import threading


class GameState(Enum):
    WAITING = 0,
    GET_QUESTION = 1,
    ANSWER_QUESTION = 2,
    VOTING = 3


class Game:
    def __init__(self):
        self.round: int = -1
        self.players: list[str] = []
        self.players_reminaing: list[str] = []
        self.state: GameState = GameState.WAITING
        self.questions: dict[str, str] = {}  # key: sid, value: question
        self.responses: dict[str, str] = {}  # key: sid, value: response
        self.votes: dict[str, int] = {}  # key: sid, value: vote
        self.sid_to_player_id: bidict[str, int] = bidict()
        self.player_id = 0
        self.total_votes = {}
    
    def started(self) -> bool:
        return self.state != GameState.WAITING
    
    def _emit_all(self, event: str, *args):
        for player in self.players:
            sio.emit(event, args, to=player)
            
    def _get_question(self):
        questions_list = list(self.questions.items())
        random.shuffle(questions_list)
        
        del self.questions[questions_list[0][0]]
        print(f"{questions_list[0][1]=}")
        return questions_list[0][1]
    
    def add_question(self, sid: str, question: str):
        print(f"Received question {question=}")
        self.questions[sid] = question
    
    def add_response(self, sid: str, response: str):
        print(f"Received response {response=}")
        self.responses[sid] = response
    
    def add_vote(self, sid: str, vote: int):
        self.votes[sid] = vote
    
    def _gen_ai_response(self, question: str):
        # Intended to be run on another thread
        ai_output = ollama.generate(
            model="llama3.1:8b",
            prompt=config.PROMPT.replace("{{QUESTION}}", question)
        )
        
        self.add_response("ai", ai_output["response"])
    
    def _collect_responses(self):
        player_id_and_response = [
            (self.sid_to_player_id[sid], response)
            for sid, response in self.responses.items()
        ]
        
        return sorted(player_id_and_response, key=lambda x: x[0])
    
    def _get_summary(self):
        summary = sorted(list(self.total_votes.items()), key=lambda x: x[1], reverse=True)
    
    def run(self):
        self.players_reminaing = list(self.players)  # Shallow copy

        for player in self.sid_to_player_id.values():
            self.total_votes[player] = 0

        self.state = GameState.GET_QUESTION
        question_prompt_time = 30
        
        self._emit_all("question-prompt", question_prompt_time)
        while question_prompt_time > 0 and len(self.questions) < len(self.players_reminaing):
            question_prompt_time -= 1
            time.sleep(1)

        self.add_player("ai")

        while len(self.questions) > 0:
            self.state = GameState.ANSWER_QUESTION
            answer_time = 30
            self.responses = {}
            question = self._get_question()
            self._emit_all("answer-question", answer_time, question)
            
            ai_response_thread = threading.Thread(target=self._gen_ai_response, args=(question,))
            ai_response_thread.start()
            while answer_time > 0 and len(self.responses) < len(self.players_reminaing) + 1:
                answer_time -= 1
                time.sleep(1)
            ai_response_thread.join()
            
            for sid in self.players_reminaing:
                if sid not in self.responses:
                    self.responses[sid] = "This player did not respond in time"
            
            self.state = GameState.VOTING
            vote_time = 30
            self._emit_all("vote", vote_time, self._collect_responses())
            self.votes = {}
            while vote_time > 0 and len(self.votes) < len(self.players_reminaing):
                vote_time -= 1
                time.sleep(1)
            
            print("done voting")
            print(self.votes)
            print(f"{self.sid_to_player_id=}")
            for sid, vote in self.votes.items():
                try:
                    vote = int(vote)
                except ValueError:
                    print("Invalid vote")
                    continue
                
                if self.sid_to_player_id[sid] == vote:
                    # Cannot vote for yourself
                    print("cannot vote for yourself")
                    continue
                
                print(vote, vote in self.sid_to_player_id.inv)
                if vote not in self.sid_to_player_id.inv:  # Player that is voted for does not exist
                    print("player doesn't exist")
                    continue
                
                self.total_votes[vote] = self.total_votes.get(vote, 0) + 1
                
            self.round += 1
        
        self.state = GameState.WAITING
        self._emit_all("end", sorted(list(self.total_votes.items()), key=lambda x: x[1], reverse=True), -1)
        
        time.sleep(10)
        self._emit_all("waiting-room")
    
    def add_player(self, sid: str):
        self.player_id += 1
        self.sid_to_player_id[sid] = self.player_id
        self.players.append(sid)
    
    def remove_player(self, sid: str):
        del self.sid_to_player_id[sid]
        self.players.remove(sid)
    
    def update_player_count(self):
        self._emit_all("players", len(self.players))
    