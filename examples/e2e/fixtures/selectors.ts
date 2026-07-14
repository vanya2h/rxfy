/** Shared selectors for the blog apps (identical examples-shared UI). */
export const blog = {
  postLink: 'a[href^="/posts/"]',
  nameInput: 'input[placeholder="Your name"]',
  // NOTE: the placeholder ends with a real ellipsis character (…), not three dots.
  commentInput: 'textarea[placeholder="Your comment…"]',
  submit: 'button:has-text("Post comment")',
  /** UpdatesBadge renders a <button> reading "{n} new comment{s} · refresh". */
  badgeName: /new comment/i,
};

/** Shared selectors for the todos templates. */
export const todos = {
  addInput: 'input[placeholder="What needs doing?"]',
  addButton: 'button:has-text("Add")',
  badge: "button.updates-badge",
  checkbox: "li input[type=checkbox]",
};
