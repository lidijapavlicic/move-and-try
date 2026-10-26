/* MOVE&TRY — zajednička navigacija javne PWA aplikacije */

#moveandtry-app-nav {
    position: fixed;
    z-index: 2147483000;
    left: 0;
    right: 0;
    bottom: 0;

    display: flex;
    justify-content: space-around;
    align-items: stretch;

    background: rgba(247, 246, 242, 0.98);
    border-top: 1px solid #dcded6;

    padding:
        10px
        max(12px, env(safe-area-inset-right))
        calc(10px + env(safe-area-inset-bottom))
        max(12px, env(safe-area-inset-left));

    box-shadow: 0 -3px 15px rgba(0, 0, 0, 0.04);
    font-family: 'Manrope', Arial, sans-serif;
}

#moveandtry-app-nav a {
    flex: 1;
    min-width: 0;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;

    padding: 4px 2px;

    color: #697067;
    text-decoration: none;
    font-size: 10px;
    font-weight: 700;
    line-height: 1.3;

    background: transparent;
    border: 0;
}

#moveandtry-app-nav a[aria-current="page"] {
    color: #1f2a18;
}

#moveandtry-app-nav svg {
    width: 22px;
    height: 22px;

    fill: none;
    stroke: currentColor;
    stroke-width: 1.7;
    stroke-linecap: round;
    stroke-linejoin: round;
}

html.moveandtry-public-app-page body {
    padding-bottom: calc(84px + env(safe-area-inset-bottom)) !important;
}

@media (min-width: 720px) {
    #moveandtry-app-nav {
        left: 50%;
        right: auto;
        transform: translateX(-50%);
        width: min(720px, 100%);
    }
}
