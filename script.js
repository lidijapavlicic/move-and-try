const SUPABASE_URL = "https://pdyngeaykfpybeafjtpw.supabase.co";
const SUPABASE_KEY = "sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK";

const RUNNING_VOTE_KEY = "moveandtry_running_vote";


/* =========================
   TRY VERDICT
========================= */

function getTrySlug() {

    const path = window.location.pathname.toLowerCase();

    if (path.includes("try-running")) {
        return "running";
    }

    if (path.includes("try-pole-dance")) {
        return "pole-dance";
    }

    return null;
}


function getVoteKey(trySlug) {
    return `moveandtry_vote_${trySlug}`;
}


/* =========================
   LOAD VOTES
========================= */

async function loadTryVotes(trySlug) {

    const response = await fetch(
        `${SUPABASE_URL}/rest/v1/try_votes?try_slug=eq.${trySlug}&select=verdict`,
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

    const lovedCount =
        document.getElementById("count-loved");

    const unsureCount =
        document.getElementById("count-unsure");

    const hatedCount =
        document.getElementById("count-hated");

    const totalTried =
        document.getElementById("total-tried");

    if (lovedCount) {
        lovedCount.textContent = counts.loved;
    }

    if (unsureCount) {
        unsureCount.textContent = counts.unsure;
    }

    if (hatedCount) {
        hatedCount.textContent = counts.hated;
    }

    if (totalTried) {

        totalTried.textContent =
            counts.loved +
            counts.unsure +
            counts.hated;

    }
}


/* =========================
   SUBMIT VOTE
========================= */

async function submitTryVote(trySlug, verdict) {

    const voteKey =
        getVoteKey(trySlug);

    const existingVote =
        localStorage.getItem(voteKey);

    if (existingVote) {
        return;
    }

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
                try_slug: trySlug,
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

    localStorage.setItem(
        voteKey,
        verdict
    );

    markSelectedVerdict(verdict);

    await loadTryVotes(trySlug);
}


/* =========================
   SELECTED VERDICT
========================= */

function markSelectedVerdict(verdict) {

    const buttons =
        document.querySelectorAll(".verdict-card");

    buttons.forEach(button => {

        button.disabled = true;

        if (button.dataset.verdict === verdict) {
            button.classList.add("selected");
        }

    });
}


/* =========================
   VERDICT BUTTONS
========================= */

const verdictButtons =
    document.querySelectorAll(".verdict-card");

const currentTrySlug =
    getTrySlug();

if (currentTrySlug) {

    verdictButtons.forEach(button => {

        button.addEventListener("click", async () => {

            const verdict =
                button.dataset.verdict;

            await submitTryVote(
                currentTrySlug,
                verdict
            );

        });

    });

}


/* =========================
   INITIAL LOAD
========================= */

if (
    currentTrySlug &&
    document.getElementById("total-tried")
) {

    loadTryVotes(currentTrySlug);

    const voteKey =
        getVoteKey(currentTrySlug);

    const existingVote =
        localStorage.getItem(voteKey);

    if (existingVote) {
        markSelectedVerdict(existingVote);
    }

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

    window.location.href =
        randomTry;
}


/* =========================
   WHAT SHOULD WE TRY NEXT?
========================= */

const tryForm =
    document.getElementById("try-form");

if (tryForm) {

    tryForm.addEventListener(
        "submit",
        async (event) => {

            event.preventDefault();

            const input =
                document.getElementById("try-input");

            const message =
                document.getElementById("suggestion-message");

            const suggestion =
                input.value.trim();

            if (!suggestion) {
                return;
            }

            const submitButton =
                tryForm.querySelector(
                    'button[type="submit"]'
                );

            submitButton.disabled = true;
            submitButton.textContent =
                "SENDING...";

            const response = await fetch(
                `${SUPABASE_URL}/rest/v1/try_suggestions`,
                {
                    method: "POST",
                    headers: {
                        apikey: SUPABASE_KEY,
                        Authorization:
                            `Bearer ${SUPABASE_KEY}`,
                        "Content-Type":
                            "application/json"
                    },
                    body: JSON.stringify({
                        suggestion: suggestion
                    })
                }
            );

            if (!response.ok) {

                const error =
                    await response.text();

                console.error(
                    "Could not submit suggestion:",
                    response.status,
                    error
                );

                message.textContent =
                    "Something went wrong. Please try again.";

                submitButton.disabled = false;
                submitButton.textContent =
                    "SEND IT →";

                return;
            }

            input.value = "";

            message.textContent =
                "Got it. Maybe this will be our next TRY. 👀";

            submitButton.textContent =
                "SENT ✓";

            setTimeout(() => {

                submitButton.disabled = false;
                submitButton.textContent =
                    "SEND IT →";

            }, 2500);

        }
    );

}


/* =========================
   SHARE EXPERIENCE FORM
========================= */

const experienceForm =
    document.getElementById("experience-form");

if (experienceForm) {

    experienceForm.addEventListener(
        "submit",
        async function (event) {

            event.preventDefault();

            const isCroatian =
                window.location.pathname.startsWith("/hr/");

            const submitButton =
                experienceForm.querySelector(".share-submit");

            const status =
                document.getElementById("experience-form-status");

            submitButton.disabled = true;

            submitButton.textContent =
                isCroatian
                    ? "ŠALJEM..."
                    : "SHARING...";

            try {

                const response =
                    await fetch(
                        experienceForm.action,
                        {
                            method: "POST",
                            body: new FormData(experienceForm),
                            headers: {
                                "Accept": "application/json"
                            }
                        }
                    );

                if (response.ok) {

                    if (isCroatian) {

                        experienceForm.innerHTML = `
                            <div class="share-success">

                                <p class="section-label">
                                    ISKUSTVO POSLANO
                                </p>

                                <h2>
                                    HVALA TI<br>
                                    ŠTO SI GA PODIJELIO/LA.
                                </h2>

                                <p>
                                    Probao/la si. Podijelio/la si.
                                </p>

                                <p>
                                    Možda će tvoje iskustvo pomoći
                                    nekome drugome da napravi prvi korak.
                                </p>

                                <a
                                    href="/hr/"
                                    class="share-success-link"
                                >
                                    NATRAG NA MOVE & TRY →
                                </a>

                            </div>
                        `;

                    } else {

                        experienceForm.innerHTML = `
                            <div class="share-success">

                                <p class="section-label">
                                    EXPERIENCE SHARED
                                </p>

                                <h2>
                                    THANK YOU<br>
                                    FOR SHARING.
                                </h2>

                                <p>
                                    You tried it. You shared it.
                                </p>

                                <p>
                                    Maybe your experience will help
                                    someone else take their first step.
                                </p>

                                <a
                                    href="/"
                                    class="share-success-link"
                                >
                                    BACK TO MOVE & TRY →
                                </a>

                            </div>
                        `;

                    }

                    window.scrollTo({
                        top: experienceForm.offsetTop - 80,
                        behavior: "smooth"
                    });

                } else {

                    throw new Error(
                        "Submission failed"
                    );

                }

            } catch (error) {

                status.textContent =
                    isCroatian
                        ? "Nešto je pošlo po zlu. Pokušaj ponovno."
                        : "Something went wrong. Please try again.";

                submitButton.disabled = false;

                submitButton.textContent =
                    isCroatian
                        ? "PODIJELI SVOJE ISKUSTVO →"
                        : "SHARE MY EXPERIENCE →";

            }

        }
    );

}


/* =========================
   LANGUAGE
========================= */

const LANGUAGE_KEY =
    "moveandtry_language";

function getPreferredLanguage() {

    const savedLanguage =
        localStorage.getItem(LANGUAGE_KEY);

    if (savedLanguage) {
        return savedLanguage;
    }

    const browserLanguage =
        navigator.language ||
        navigator.userLanguage ||
        "en";

    return browserLanguage
        .toLowerCase()
        .startsWith("hr")
        ? "hr"
        : "en";
}


function setLanguage(language) {

    localStorage.setItem(
        LANGUAGE_KEY,
        language
    );

}
