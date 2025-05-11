import random

import config
from game import Game


def int_to_code(n):
    code = ""
    for _ in range(config.GAME_CODE_LETTERS):
        code = chr(ord("A") + n % 26) + code
        n //= 26
    return code


def random_code():
    return int_to_code(random.randint(0, 26**config.GAME_CODE_LETTERS - 1))


class Games:
    def __init__(self):
        self.code_to_game: dict[str, Game] = {}
        self.sid_to_game: dict[str, Game] = {}
    
    def create_game(self) -> str:
        game_code = random_code()
        
        iter_counter = 0
        cannot_find_game = False
        while game_code in self.code_to_game:
            game_code = random_code()
            iter_counter += 1
            
            if iter_counter > 100:
                cannot_find_game = True
                break
        
        if cannot_find_game:
            return ""
        
        self.code_to_game[game_code] = Game(game_code)
        
        return game_code
    
    def add_player(self, code: str, sid: str, name: str):
        game = self.code_to_game[code]
        
        game.add_player(sid, name)
        self.sid_to_game[sid] = game
        game.update_player_count()
    
    def remove_player(self, sid: str):
        game = self.sid_to_game.get(sid)
        if game is None:
            return
        
        game.remove_player(sid)
        del self.sid_to_game[sid]
        game.update_player_count()
        
        # If there's nobody in the room, delete it
        if game.num_players() == 0:
            del self.code_to_game[game.game_code]
    
    def has_game(self, code: str):
        return code in self.code_to_game
    
    def delete_game(self, code: str):
        pass
    
    def get_game(self, code: str) -> Game:
        return self.code_to_game[code]
    