

$(document).ready(() => {
    $("#create-game").click((e) => {
        fetch("/api/create-game", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: {}
        }).then(response => response.json())
            .then(data => window.location.href = "/game-room/" + data["code"])
    });
});
