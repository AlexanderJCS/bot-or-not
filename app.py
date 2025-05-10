from flask_socketio import SocketIO

from flask import Flask, render_template, request, redirect, url_for

from games import Games
import config

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins=config.CORS_ALLOWED_ORIGINS)

games = Games()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/game-room/<game_id>")
def game_room(game_id):
    # Create game if it doesn't exist when developing
    if config.PROD is False and not games.has_game(game_id):
        code = games.create_game()
        return redirect(url_for("game_room", game_id=code))

    elif not games.has_game(game_id):
        # TODO: handle this more gracefully
        raise ValueError("No game exists")

    return render_template("game_room.html", websocket_connection_url=config.WEBSOCKET_CONNECTION_URL)


@app.route("/api/create-game", methods=["POST"])
def create_game():
    return {"code": games.create_game()}


@socketio.on("join_game")
def handle_join_game(game_code: str, name: str):
    if not games.has_game(game_code):
        print("No game code!")
        return  # Game code not found
        
    games.add_player(game_code, request.sid, name)


@socketio.on("disconnect")
def handle_disconnect():
    games.remove_player(request.sid)


@socketio.on("submit-question")
def submit_question(question: str):
    game = games.sid_to_game.get(request.sid)
    if game is None:
        return
    
    game.add_question(request.sid, question)


@socketio.on("vote-for")
def vote_for(vote: int):
    game = games.sid_to_game.get(request.sid)
    if game is None:
        return
    
    game.add_vote(request.sid, vote)


@socketio.on("submit-response")
def submit_response(response: str):
    game = games.sid_to_game.get(request.sid)
    if game is None:
        return
    
    game.add_response(request.sid, response)


@socketio.on("start")
def start_game():
    game = games.sid_to_game.get(request.sid)
    if game is None:
        return
    
    if not game.running:
        game.run()


if __name__ == "__main__":
    app.run(debug=True)
