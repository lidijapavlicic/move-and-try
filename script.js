const SUPABASE_URL = "https://pdyngeaykfpybeafjtpw.supabase.co";
const SUPABASE_KEY = "sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK";

async function loadRunningVotes() {
    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/try_votes?try_slug=eq.running&select=verdict`,
        {
            headers: {
                apikey: SUPABASE_KEY
            }
        }
    );

    if (!response.ok) {
        console.error("Could not load votes.");
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

    document.getElementById("count-loved").textContent = counts.loved;
    document.getElementById("count-unsure").textContent = counts.unsure;
    document.getElementById("count-hated").textContent = counts.hated;

    document.getElementById("total-tried").textContent =
        counts.loved + counts.unsure + counts.hated;
}

if (document.getElementById("total-tried")) {
    loadRunningVotes();
}

const tries = [
    "running.html"
];

function surpriseMe() {
    const randomIndex = Math.floor(Math.random() * tries.length);
    const randomTry = tries[randomIndex];

    window.location.href = randomTry;
}
