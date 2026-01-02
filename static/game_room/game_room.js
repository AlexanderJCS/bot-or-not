let socket;
let lastQuestion = "";
let lastStyle = "";
let countdownStartTime = 0;
let maxCountdownTime = 0;
let currentPlayerID = -1;

const QUESTIONS = [
  "What is something everyone thinks they understand, but usually doesn’t?",
  "What object would confuse an archaeologist from 1,000 years in the future the most?",
  "What is the most underrated human skill?",
  "If this room could talk, what secret would it reveal first?",
  "What rule of society would surprise an intelligent alien?",
  "What small habit quietly changes a person’s entire life?",
  "What sounds harmless but actually isn’t?",
  "What would be the worst possible mascot for a hospital?",
  "What is something people only learn after it’s too late?",
  "What invention solved one problem but created ten others?",
  "What would be a terrible name for a self-help book?",
  "What is something that feels illegal but isn’t?",
  "What question should people ask more often, but don’t?",
  "What would instantly ruin a first impression?",
  "What is the strangest thing that humans all silently agree on?",
  "What would be the most inconvenient superpower?",
  "What is a sign that someone is secretly very competent?",
  "What would make a meeting immediately go off the rails?",
  "What is something people pretend to enjoy?",
  "What would be a bad slogan for a time machine?",
  "What everyday object is far more powerful than it looks?",
  "What is the most dramatic way to do something very boring?",
  "What mistake do people keep making, even when they know better?",
  "What would be a suspiciously specific warning label?",
  "What is something that feels like a test, but isn’t?"
];

const THEMES = [
  "Answer like a pirate who recently discovered therapy",
  "Answer as if you are giving live commentary during a disaster documentary",
  "Answer like an overly serious medieval scholar",
  "Answer as a very confident person who is slightly wrong",
  "Answer as if you are whispering in a library",
  "Answer like a sports announcer calling a dramatic final play",
  "Answer as a customer support chatbot losing patience",
  "Answer like a wise grandparent who refuses to use modern examples",
  "Answer as if you are explaining this to a very skeptical cat",
  "Answer like a motivational speaker who took it too far",
  "Answer as if you are being interrogated and overexplaining",
  "Answer like a travel guide describing something extremely mundane",
  "Answer as if you are giving a speech you did not prepare for",
  "Answer like a scientist who just made an accidental breakthrough",
  "Answer as if you are trying to sound human but aren’t quite succeeding",
  "Answer like a detective narrating a noir film",
  "Answer as if this is a legally binding statement",
  "Answer like an ancient oracle who is tired of vague questions",
  "Answer as if you are live-tweeting the situation out loud",
  "Answer like a calm meditation instructor during chaos",
  "Answer as if you are a substitute teacher asserting control",
  "Answer like a museum audio guide for a very odd exhibit",
  "Answer as if you are explaining it to someone from the year 1800",
  "Answer like a survival guide for an unnecessary scenario",
  "Answer as if you are giving birth in that exact moment"
];

function getRandomItem(list) {
  return list[Math.floor(Math.random() * list.length)];
}

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

    socket.on("players", (numPlayers, playerNames) => {
        $("#num-players").text(numPlayers);

        let playersElement = $("#players");
        playersElement.empty();
        playerNames.forEach((player) => {
            playersElement.append(`<div class="player">${player}</div>`)
        });
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

    socket.on("answer-question", (time, question, style) => {
        showSection("#answer-question");
        $("#submit-question-response").prop("disabled", false).text("Submit Response");
        $("#question").text(question);
        $("#style").text(style);
        lastQuestion = question;
        lastStyle = style;
        countdown(time);
        $("#question-response").focus();
    });

    socket.on("vote", (time, responses) => {
        showSection("#vote");
        $("#last-question").text(lastQuestion);
        $("#last-style").text(lastStyle);

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

    $("#question-idea-generator").click(() => {
        const randomQuestion = getRandomItem(QUESTIONS);
        $("#question-input").val(randomQuestion).trigger("input");
    });

    $("#style-idea-generator").click(() => {
        const randomStyle = getRandomItem(THEMES);
        $("#style-input").val(randomStyle).trigger("input");
    });

    $("#question-input").on("input", () => {
        $("#chars-consumed-question-prompt").text($("#question-input").val().length);
    });

    $("#style-input").on("input", () => {
        $("#chars-consumed-style-prompt").text($("#style-input").val().length);
    });

    $("#question-response").on("input", () => {
        $("#chars-consumed-question-response").text($("#question-response").val().length);
    });

    $("#submit-question").click(() => {
        const question = $("#question-input").val().trim();
        const style = $("#style-input").val().trim();
        if (!question || !style) {
            return;
        }

        socket.emit("submit-question", {
            "question": question,
            "style": style
        });
        $("#question-input").val("");
        $("#submit-question").prop("disabled", true).text("Submitted");
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
