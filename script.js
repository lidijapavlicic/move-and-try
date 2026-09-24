const SUPABASE_URL = "https://pdyngeaykfpybeafjtpw.supabase.co";
const SUPABASE_KEY = "sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK";


/* =========================
   RUNNING — LOAD VOTES
========================= */

async function loadRunningVotes() {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/try_votes?try_slug=eq.running&select=verdict`,
        {
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`
            }
        }
    );

    if (!response.ok) {
        const error = await response.text();
        console.error(
            "Could not load votes:",
            response.status,
            error
        );
        return;
    }

    const votes = await response.json();

    const counts = {
        loved: 0,
        unsure: 0,
        hated: 0
    };

    votes.forEach(vote => {
        if (counts[vote.verdict] !== undefined) {
            counts[vote.verdict]++;
        }
    });

    document.getElementById("count-loved").textContent =
        counts.loved;

    document.getElementById("count-unsure").textContent =
        counts.unsure;

    document.getElementById("count-hated").textContent =
        counts.hated;

    const total =
        counts.loved +
        counts.unsure +
        counts.hated;

    document.getElementById("total-tried").textContent =
        total;
}


/* =========================
   RUNNING — SUBMIT VOTE
========================= */

async function submitRunningVote(verdict) {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/try_votes`,
        {
            method: "POST",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                try_slug: "running",
                verdict: verdict
            })
        }
    );

    if (!response.ok) {
        const error = await response.text();

        console.error(
            "Could not submit vote:",
            response.status,
            error
        );

        return;
    }

    await loadRunningVotes();
}


/* =========================
   RUNNING — VERDICT BUTTONS
========================= */

const verdictButtons =
    document.querySelectorAll(".verdict-card");

verdictButtons.forEach(button => {
    button.addEventListener("click", async () => {
        const verdict = button.dataset.verdict;

        await submitRunningVote(verdict);
    });
});


/* =========================
   RUNNING — INITIAL LOAD
========================= */

if (document.getElementById("total-tried")) {
    loadRunningVotes();
}


/* =========================
   SURPRISE ME
========================= */

const tries = [
    "running.html"
];

function surpriseMe() {
    const randomIndex =
        Math.floor(Math.random() * tries.length);

    const randomTry =
        tries[randomIndex];

    window.location.href = randomTry;
}
