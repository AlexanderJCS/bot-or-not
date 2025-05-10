$(document).ready(() => {
    // Get room code from URL if it exists (for easy sharing)
    const urlParams = new URLSearchParams(window.location.search);
    const roomCode = urlParams.get('room');
    
    if (roomCode) {
        $("#room-id").val(roomCode);
    }
    
    $("#create-game").click((e) => {
        const playerName = $("#name").val().trim();
        sessionStorage.setItem("name", playerName);

        if (!playerName) {
            alert("Please enter your name");
            return;
        }
        
        fetch("/api/create-game", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({ name: playerName })
        }).then(response => response.json())
            .then(data => window.location.href = "/game-room/" + data["code"])
            .catch(error => console.error("Error creating game:", error));
    });
    
    $("#join-room").click((e) => {
        const roomId = $("#room-id").val().trim();
        const playerName = $("#join-name").val().trim();
        sessionStorage.setItem("name", playerName);
        
        if (!roomId) {
            alert("Please enter a room ID");
            return;
        }
        
        if (!playerName) {
            alert("Please enter your name");
            return;
        }
        
        window.location.href = "/game-room/" + roomId;
    });
    
    // Allow pressing Enter to submit
    $("#name, #room-id, #join-name").keypress(function(e) {
        if (e.which === 13) {
            if (this.id === "name") {
                $("#create-game").click();
            } else {
                $("#join-room").click();
            }
        }
    });
});
