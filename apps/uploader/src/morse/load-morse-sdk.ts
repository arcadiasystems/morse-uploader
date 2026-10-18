/** Loads morse-sdk on first use, so the app shell does not carry it. */
export const loadMorseSdk = () => import("@arcadiasystems/morse-sdk");

export type MorseSdk = Awaited<ReturnType<typeof loadMorseSdk>>;
