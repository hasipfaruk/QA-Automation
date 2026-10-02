/** Parse ?page=&limit= into SQL limit/offset with sane bounds. */
export function paging(req, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query.limit) || defaultLimit));
  const page = Math.max(1, Number(req.query.page) || 1);
  return { limit, offset: (page - 1) * limit, page };
}

export const pageResult = ({ total, data }, { limit, page }) => ({
  data,
  page,
  pages: Math.max(1, Math.ceil(total / limit)),
  total,
});

/** Read an optional string query filter, trimmed and length-limited. */
export const queryText = (value, max = 100) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);
