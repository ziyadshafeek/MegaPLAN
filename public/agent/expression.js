// Arithmetic-only parser. Never execute model-provided expressions with Function/eval.
// Kept self-contained so the same function can be embedded in an opaque-origin preview.
export function evaluateExpression(expression, variables) {
  if (typeof expression !== 'string' || expression.length > 256) throw Error('Invalid expression');
  const tokens = [];
  const re = /\s+|(?:\d+(?:\.\d*)?|\.\d+)|[a-z][a-z0-9_]*|[()+*/-]/gy;
  let at = 0, match;
  while (at < expression.length) {
    re.lastIndex = at;
    match = re.exec(expression);
    if (!match) throw Error('Invalid expression');
    at = re.lastIndex;
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
  }
  if (!tokens.length || tokens.length > 100) throw Error('Invalid expression');
  let pos = 0, depth = 0;
  function atom() {
    if (++depth > 20) throw Error('Expression too deep');
    const t = tokens[pos++]; let value;
    if (t === '+' || t === '-') value = (t === '-' ? -1 : 1) * atom();
    else if (t === '(') {
      value = sum();
      if (tokens[pos++] !== ')') throw Error('Missing closing parenthesis');
    } else if (/^(?:\d|\.\d)/.test(t || '')) value = Number(t);
    else if (/^[a-z][a-z0-9_]*$/.test(t || '') && Object.hasOwn(variables, t)) value = Number(variables[t]);
    else throw Error('Unknown input or invalid expression');
    depth--;
    return value;
  }
  function product() {
    let value = atom();
    while (tokens[pos] === '*' || tokens[pos] === '/') {
      const op = tokens[pos++], rhs = atom();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }
  function sum() {
    let value = product();
    while (tokens[pos] === '+' || tokens[pos] === '-') {
      const op = tokens[pos++], rhs = product();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }
  const result = sum();
  if (pos !== tokens.length || !Number.isFinite(result)) throw Error('Invalid result or expression');
  return result;
}

export function validateApiBlock(block) {
  if (!Array.isArray(block.inputs) || block.inputs.length < 1 || block.inputs.length > 8) throw Error('Invalid API inputs');
  const ids = block.inputs.map(i => i?.id);
  if (ids.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_]{0,31}$/.test(id)) || new Set(ids).size !== ids.length) throw Error('Invalid API input names');
  const vars = Object.fromEntries(ids.map(id => [id, 1]));
  evaluateExpression(block.expression, vars);
}
