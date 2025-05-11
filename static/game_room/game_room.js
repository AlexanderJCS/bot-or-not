let socket;
let lastQuestion = "";
let countdownStartTime = 0;
let maxCountdownTime = 0;
let currentPlayerID = -1;

function getGameCode() {
    let splitUrl = window.location.pathname.split('/');
    return splitUrl[splitUrl.length - 1];
}

function updateCountdownRing(time, maxTime) {
    if (!time || time <= 0) {
        $("#countdown").text("");
        $("#countdown-ring").css("background", "conic-gradient(var(--primary) 0%, transparent 0%)");
        return;
    }
    
    const percentage = (time / maxTime) * 100;
    $("#countdown").text(Math.ceil(time));
    $("#countdown-ring").css("background", `conic-gradient(var(--primary) ${percentage}%, transparent ${percentage}%)`);
    
    // Add warning colors when time is running low
    if (time <= 5) {
        $("#countdown-ring").css("background", `conic-gradient(var(--error) ${percentage}%, transparent ${percentage}%)`);
    } else if (time <= 10) {
        $("#countdown-ring").css("background", `conic-gradient(var(--warning) ${percentage}%, transparent ${percentage}%)`);
    }
    
    // Add pulse animation for last 10 seconds
    if (time <= 10) {
        $(".countdown-container").addClass("pulse");
    } else {
        $(".countdown-container").removeClass("pulse");
    }
}

function countdown(time) {
    maxCountdownTime = time; // Update the global max countdown
    countdownStartTime = performance.now();
    updateCountdownRing(time, maxCountdownTime);
}

function addPlayerResponse(responseText, playerNumber) {
    const playerResponse = $(`
        <div class="player-response fade-in">
            <div class="response-text">${responseText}</div>
            <button class="vote-button" id="vote-player-${playerNumber}">Vote</button>
        </div>
    `);

    $("#player-responses").append(playerResponse);
}

function addLeaderboardEntry(player, score) {
    const entry = $(`
        <div class="leaderboard-entry fade-in">
            <span class="player-id">${player}</span>
            <span class="player-score">${score} votes</span>
        </div>
    `);
    
    $("#leaderboard").append(entry);
}

function showSection(sectionId) {
    // Hide all sections
    $("#question-prompt, #waiting-info, #vote, #answer-question, #results, #limbo").hide();
    
    // Show the requested section with animation
    $(sectionId).show().addClass("fade-in");
    
    // Remove animation class after animation completes
    setTimeout(() => {
        $(sectionId).removeClass("fade-in");
    }, 500);
}

function init() {
    // Display room code for sharing
    $("#room-code-display").text(getGameCode());

    // Initialize countdown timer
    setInterval(() => {
        let remainingTime = maxCountdownTime - (performance.now() - countdownStartTime) / 1000;
        updateCountdownRing(remainingTime, maxCountdownTime)
    }, 5);

    // Hide all game sections initially
    showSection("#limbo");

    // Connect to websocket
    socket = io.connect(SERVER_IP);

    socket.on("players", (num_players) => {
        $("#num-players").text(num_players);
    });

    socket.on("connect", () => {
        console.log("Connected to server");

        const gameCode = getGameCode();
        let name = sessionStorage.getItem("name");

        if (name === null || name.trim() === "") {
            // Prompt the user for the name
            name = prompt("Please enter your name:")

            if (name === null || name.trim() === "") {  // Name is still undefined (i.e., user cancelled)
                name = "No name entered";
            } else {
                sessionStorage.setItem("name", name);
            }
        }

        console.log("Name: ", name)

        socket.emit("join_game", gameCode, name);
        
        showSection("#limbo");
    });

    socket.on("game-status", (isRunning) => {
        console.log("game status", isRunning)

        if (isRunning) {
            showSection("#limbo");
        } else {
            showSection("#waiting-info");
        }
    });

    socket.on("waiting-room", () => {
        showSection("#waiting-info");
        updateCountdownRing(0); // Reset countdown
        $("#start").prop("disabled", false).text("Start Game");
    });

    socket.on("question-prompt", (time) => {
        showSection("#question-prompt");
        countdown(time); // Pass the max time as well

        $("#submit-question").prop("disabled", false).text("Submit Question");
        $("#question-input").focus();
    });

    socket.on("answer-question", (time, question) => {
        showSection("#answer-question");
        $("#submit-question-response").prop("disabled", false).text("Submit Response");
        $("#question").text(question);
        lastQuestion = question;
        countdown(time);
        $("#question-response").focus();
    });

    socket.on("vote", (time, responses) => {
        showSection("#vote");
        $("#last-question").text(lastQuestion);

        $("#player-responses").empty();
        for (let i = 0; i < responses.length; i++) {
            const [playerID, response] = responses[i];
            if (playerID === currentPlayerID) {
                continue;  // do not show this player's response
            }

            addPlayerResponse(response, playerID);
        }

        countdown(time);
    });

    socket.on("end", (results, humansWin, timeout) => {
        showSection("#results");

        if (humansWin) {
            $("#winner-reveal").text("Humans Win — Bot was identified")
        } else {
            $("#winner-reveal").text(`${results[0]} wins — They were voted as the bot, but human all along!`)
        }

        $("#leaderboard").empty();
        results.forEach((result) => {
            const [player, score] = result;
            addLeaderboardEntry(player, score);
        });
        
        countdown(timeout);
    });

    socket.on("your-player-id", (playerID) => {
        currentPlayerID = playerID;
    });

    // Button event handlers
    $("#start").click(() => {
        socket.emit("start");
        $("#start").prop("disabled", true).text("Starting...");
    });

    $("#submit-question").click(() => {
        const question = $("#question-input").val().trim();
        if (question) {
            socket.emit("submit-question", question);
            $("#question-input").val("");
            $("#submit-question").prop("disabled", true).text("Submitted");
        }
    });

    $("#submit-question-response").click(() => {
        const response = $("#question-response").val().trim();

        if (response) {
            socket.emit("submit-response", response);
            $("#question-response").val("");
            $("#submit-question-response").prop("disabled", true).text("Submitted");
        }
    });

    $(document).on("click", ".vote-button", function() {
        const playerID = $(this).attr("id").split("-")[2];  // extract player number
        socket.emit("vote-for", playerID);
        
        // Visual feedback for vote
        $(".vote-button").prop("disabled", true);
        $(this).text("Voted").addClass("voted");
    });
    
    // Allow pressing Enter to submit
    $("#question-input").keypress(function(e) {
        if (e.which === 13) {
            $("#submit-question").click();
        }
    });
    
    $("#question-response").keypress(function(e) {
        if (e.which === 13) {
            $("#submit-question-response").click();
        }
    });
}

$(document).ready(() => {
    init();
});
