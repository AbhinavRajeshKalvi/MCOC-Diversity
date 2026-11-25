// Small values shared by the server, the review table and the Discord bot.
// Kept free of imports so client components can use it without pulling in the
// scanner (sharp, Tesseract).

/** Rows below this confidence are flagged for the user to check. */
export const REVIEW_THRESHOLD = 0.5;

/** The page that shows the import review table (it renders RosterImport). */
export const ROSTER_PAGE = "/profile";

/** Query parameter that opens a draft made in Discord in the review table. */
export const DRAFT_PARAM = "importDraft";
