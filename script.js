const SUPABASE_URL = "https://pdyngeaykfpybeafjtpw.supabase.co";
const SUPABASE_KEY = "sb_publishable_liv_WfA9YbjizQvpOrB68w_mkVgR_WK";


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

    const message =
        document.getElementById("verdict-message");

    const isCroatian =
        document.documentElement.lang === "hr";

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

        if (message) {
            message.textContent =
                isCroatian
                    ? "Nešto je pošlo po zlu. Pokušaj ponovno."
                    : "Something went wrong. Please try again.";
        }

        return;
    }

    localStorage.setItem(
        voteKey,
        verdict
    );

    markSelectedVerdict(verdict);

    await loadTryVotes(trySlug);

    if (message) {

        const messages = isCroatian
            ? {
                loved: "❤️ Ovaj TRY ti je bio pun pogodak.",
                unsure: "🤔 I to je odgovor. Možda vrijedi probati još jednom.",
                hated: "😂 Savršeno. Sad znaš."
            }
            : {
                loved: "❤️ Looks like this TRY was worth it.",
                unsure: "🤔 That's an answer too. Maybe it's worth another try.",
                hated: "😂 Perfect. Now you know."
            };

        message.textContent =
            messages[verdict] || "";
    }
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
    "running.html",
    "pole-dance.html"
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


/* =========================
   WHAT'S NEW
========================= */

const moveAndTryUpdates = {

    en: [

        {
            type: "TRY #002 · MOVE",
            title: "POLE DANCE",
            text: "You don't need to be strong. You don't need to be flexible. You just need to be curious enough to try.",
            link: "pole-dance.html",
            action: "DISCOVER THIS TRY →"
        },

        {
            type: "TRY #001 · MOVE",
            title: "RUNNING",
            text: "You don't need to become a runner. Let's just see if you like running.",
            link: "running.html",
            action: "DISCOVER THIS TRY →"
        }

    ],

    hr: [

        {
            type: "TRY #002 · KRETANJE",
            title: "POLE DANCE",
            text: "Ne treba ti snaga. Ne treba ti fleksibilnost. Samo malo znatiželje da probaš.",
            link: "pole-dance.html",
            action: "ISTRAŽI →"
        },

        {
            type: "TRY #001 · KRETANJE",
            title: "TRČANJE",
            text: "Ne moraš postati trkač. Samo ćemo vidjeti sviđa li ti se trčanje.",
            link: "running.html",
            action: "ISTRAŽI →"
        }

    ]

};


function loadLatestUpdate() {

    const card =
        document.getElementById("latest-update");

    if (!card) {
        return;
    }

    const language =
        document.documentElement.lang === "hr"
            ? "hr"
            : "en";

    const latestUpdate =
        moveAndTryUpdates[language][0];

    document.getElementById(
        "latest-update-type"
    ).textContent = latestUpdate.type;

    document.getElementById(
        "latest-update-title"
    ).textContent = latestUpdate.title;

    document.getElementById(
        "latest-update-text"
    ).textContent = latestUpdate.text;

    document.getElementById(
        "latest-update-action"
    ).textContent = latestUpdate.action;

    card.href =
        latestUpdate.link;
}


loadLatestUpdate();

/* =========================
   MOBILE MENU
========================= */

const menuToggle =
    document.querySelector(".menu-toggle");

const mobileMenu =
    document.querySelector(".mobile-menu");

if (menuToggle && mobileMenu) {

    menuToggle.addEventListener("click", () => {

        const isOpen =
            mobileMenu.classList.toggle("is-open");

        menuToggle.classList.toggle(
            "is-open",
            isOpen
        );

        menuToggle.setAttribute(
            "aria-expanded",
            isOpen
        );

        document.body.style.overflow =
            isOpen ? "hidden" : "";

    });


    /* CLOSE MENU AFTER CLICKING A LINK */

    const mobileMenuLinks =
        mobileMenu.querySelectorAll("a");

    mobileMenuLinks.forEach(link => {

        link.addEventListener("click", () => {

            mobileMenu.classList.remove("is-open");

            menuToggle.classList.remove("is-open");

            menuToggle.setAttribute(
                "aria-expanded",
                "false"
            );

            document.body.style.overflow = "";

        });

    });

}
