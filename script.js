const tries = [
    "running.html"
];

function surpriseMe() {
    const randomIndex = Math.floor(Math.random() * tries.length);
    const randomTry = tries[randomIndex];

    window.location.href = randomTry;
}
