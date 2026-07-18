// Exit epilogue printed to scrollback when the TUI closes. Uses the shared
// oa-cli wordmark (single source of truth in ../logo — do not re-copy the glyph
// art here) rendered in brand orange, plus the resume command.
import { logo } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
const orange = "\x1b[38;2;249;115;22m" // #f97316 (primary)
const orangeSoft = "\x1b[38;2;251;146;60m" // #fb923c (secondary)

function wordmark(pad = "") {
  const draw = (line: string, fg: string, shadow: string, bg: string) =>
    [...line]
      .map((char) => {
        if (char === "_") return `${bg} ${reset}`
        if (char === "^") return `${fg}${bg}▀${reset}`
        if (char === "~") return `${shadow}▀${reset}`
        if (char === " ") return " "
        return `${fg}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const left = draw(line, orangeSoft, "\x1b[38;5;235m", "\x1b[48;5;235m")
    const right = draw(logo.right[index] ?? "", orange, "\x1b[38;5;238m", "\x1b[48;5;238m")
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}oa-cli -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
