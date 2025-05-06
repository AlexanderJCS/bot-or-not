let socket;

let lastQuestion = "";


function getGameCode() {
    let splitUrl =  window.location.pathname.split('/');
    return splitUrl[splitUrl.length - 1];
}


function countdown(time) {
    $("#countdown").text(time);
}

function addPlayerResponse(responseText, playerNumber) {
    const playerResponse = $(`
        <span class="player-response">
            <span class="player-response">
                Player ${playerNumber} Response: <span class="response">${responseText}</span>
            </span>
            <button class="vote-button" id="vote-player-${playerNumber}">Vote</button>
        </span>
    `);

    $("#player-responses").append(playerResponse);
}

function init() {
    setInterval(() => {
        let countdown = $("#countdown");
        let next = Number.parseInt(countdown.text()) - 1;
        if (next <= 0 || isNaN(next)) {
            countdown.text("");
        } else {
            countdown.text(next);
        }
    }, 1000);

    $("#question-prompt").hide();
    $("#waiting-info").hide();
    $("#vote").hide();
    $("#answer-question").hide();
    $("#results").hide();

    socket = io.connect(SERVER_IP);

    socket.on("players", (num_players) => {
        $("#num-players").text(num_players);
    });

    socket.on("connect", () => {
        console.log("Connected to server");

        let gameCode = getGameCode();
        socket.emit("join_game", gameCode);

        $("#question-prompt").hide();
        $("#waiting-info").show();
        $("#vote").hide();
        $("#answer-question").hide();
        $("#results").hide();
    });

    socket.on("waiting-room", () => {
        $("#question-prompt").hide();
        $("#waiting-info").show();
        $("#vote").hide();
        $("#answer-question").hide();
        $("#results").hide();
    });

    socket.on("question-prompt", (time) => {
        $("#question-prompt").show("fast");
        $("#waiting-info").hide("fast");
        $("#vote").hide("fast");
        $("#answer-question").hide("fast");
        $("#results").hide("fast");

        countdown(time);
    });

    socket.on("answer-question", (time, question) => {
        $("#question-prompt").hide("fast");
        $("#waiting-info").hide("fast");
        $("#vote").hide("fast");
        $("#answer-question").show("fast");
        $("#results").hide("fast");

        $("#question").text(question);
        lastQuestion = question;
        countdown(time)
    })

    socket.on("vote", (time, responses) => {
        $("#question-prompt").hide("fast");
        $("#waiting-info").hide("fast");
        $("#vote").show("fast");
        $("#answer-question").hide("fast");
        $("#results").hide("fast");

        $("#last-question").text(lastQuestion);

        $("#player-responses").empty();
        for (let i = 0; i < responses.length; i++) {
            const [playerID, response] = responses[i];
            addPlayerResponse(response, playerID);
        }

        countdown(time)
    });

    socket.on("end", (results, aiPlayer) => {
        $("#question-prompt").hide("fast");
        $("#waiting-info").hide("fast");
        $("#vote").hide("fast");
        $("#answer-question").hide("fast");
        $("#results").show("fast");

        $("#ai-player-reveal").text(aiPlayer);

        console.log(results);

        $("#leaderboard").empty();
        results.forEach((result) => {
            const [player, score] = result;

            $("#leaderboard").append($(`
                <span>Player ${player}: ${score}</span>
            `));
        });
    });

    $("#start").click(() => {
        socket.emit("start");
    });

    $("#submit-question").click(() => {
        socket.emit("submit-question", $("#question-input").val());
    });

    $("#submit-question-response").click(() => {
        socket.emit("submit-response", $("#question-response").val());
    });

    $(document).on("click", ".vote-button", function() {
        const playerID = $(this).attr("id").split("-")[2];  // extract player number

        socket.emit("vote-for", playerID);
    });
}


$(document).ready(() => {
    init();
});
