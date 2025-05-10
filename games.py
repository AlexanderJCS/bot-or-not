import hashlib

from game import Game

def hash_id_to_8_length_string(id_value: int) -> str:
    # Convert the ID to a string and hash it using SHA-256
    hash_object = hashlib.sha256(str(id_value).encode())
    # Get the hexadecimal digest and truncate it to 8 characters
    return hash_object.hexdigest()[:8]


class Games:
    def __init__(self):
        self.code_to_game: dict[str, Game] = {}
        self.sid_to_game: dict[str, Game] = {}
        self.id = 0
    
    def create_game(self) -> str:
        game_code = hash_id_to_8_length_string(self.id)
        self.id += 1
        
        self.code_to_game[game_code] = Game()
        
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
    
    def has_game(self, code: str):
        return code in self.code_to_game
    
    def delete_game(self, code: str):
        pass
    
    def get_game(self, code: str) -> Game:
        return self.code_to_game[code]
    