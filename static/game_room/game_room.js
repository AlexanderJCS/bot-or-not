let socket;
let lastQuestion = "";
let maxCountdown = 30; // Default max countdown value

function getGameCode() {
    let splitUrl = window.location.pathname.split('/');
    return splitUrl[splitUrl.length - 1];
}

function updateCountdownRing(time, maxTime = maxCountdown) {
    if (!time || time <= 0) {
        $("#countdown").text("");
        $("#countdown-ring").css("background", "conic-gradient(var(--primary) 0%, transparent 0%)");
        return;
    }
    
    const percentage = (time / maxTime) * 100;
    $("#countdown").text(time);
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

function countdown(time, maxTime = maxCountdown) {
    maxCountdown = maxTime; // Update the global max countdown
    updateCountdownRing(time, maxTime);
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
            <span class="player-id">Player ${player}</span>
            <span class="player-score">${score} points</span>
        </div>
    `);
    
    $("#leaderboard").append(entry);
}

function showSection(sectionId) {
    // Hide all sections
    $("#question-prompt, #waiting-info, #vote, #answer-question, #results").hide();
    
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
        let countdownEl = $("#countdown");
        let currentTime = Number.parseInt(countdownEl.text());
        
        if (currentTime <= 0 || isNaN(currentTime)) {
            updateCountdownRing(0);
        } else {
            currentTime -= 1;
            updateCountdownRing(currentTime, maxCountdown);
        }
    }, 1000);

    // Hide all game sections initially
    showSection("#waiting-info");

    // Connect to websocket
    socket = io.connect(SERVER_IP);

    socket.on("players", (num_players) => {
        $("#num-players").text(num_players);
    });

    socket.on("connect", () => {
        console.log("Connected to server");

        let gameCode = getGameCode();
        socket.emit("join_game", gameCode);
        
        showSection("#waiting-info");
    });

    socket.on("waiting-room", () => {
        showSection("#waiting-info");
        updateCountdownRing(0); // Reset countdown
        $("#start").prop("disabled", false).text("Start Game");
    });

    socket.on("question-prompt", (time) => {
        showSection("#question-prompt");
        countdown(time, time); // Pass the max time as well

        $("#submit-question").prop("disabled", false).text("Submit Question");
        $("#question-input").focus();
    });

    socket.on("answer-question", (time, question) => {
        showSection("#answer-question");
        $("#submit-question-response").prop("disabled", false).text("Submit Response");
        $("#question").text(question);
        lastQuestion = question;
        countdown(time, time);
        $("#question-response").focus();
    });

    socket.on("vote", (time, responses) => {
        showSection("#vote");
        $("#last-question").text(lastQuestion);

        $("#player-responses").empty();
        for (let i = 0; i < responses.length; i++) {
            const [playerID, response] = responses[i];
            addPlayerResponse(response, playerID);
        }

        countdown(time, time);
    });

    socket.on("end", (results, aiPlayer) => {
        showSection("#results");
        $("#ai-player-reveal").text(aiPlayer);

        $("#leaderboard").empty();
        results.forEach((result) => {
            const [player, score] = result;
            addLeaderboardEntry(player, score);
        });
        
        updateCountdownRing(0); // Reset countdown
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
