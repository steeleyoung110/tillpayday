<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Known gotcha (verified in this repo)

JSX drops the space between an expression and following text on the same line:
`{value} label` renders as `valuelabel` (`5 years<!-- -->projection`). Write
mixed expression+text content as a single template literal
(`` {`${value} label`} ``) or use an explicit `{" "}`.
<!-- END:nextjs-agent-rules -->
