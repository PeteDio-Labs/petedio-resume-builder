/**
 * The Typst source for resume export, embedded as a string.
 *
 * Deliberately NOT a `.typ` file on disk: adapter-node bundles JS only, so a
 * stray asset wouldn't ship with `build/`. Embedding it guarantees the template
 * travels with the code.
 *
 * SECURITY: resume content is NEVER interpolated into this source. The template
 * reads `resume.json` from its compile directory (`#let data = json(...)`), so
 * user text can never become Typst code. Do not "improve" this by string-
 * building the document from the doc.
 *
 * Template A = ATS-safe single column. Template B = same body under a tinted
 * banner (dark text on light tint — white-on-dark is the parser/stuffing-
 * detector risk case). Chosen via `--input template=A|B`.
 *
 * No backslashes: this lives in a TS template literal, where a stray escape
 * would silently mangle the source. Use #linebreak() instead of Typst's `\`.
 */
export const TYPST_RESUME_TEMPLATE = String.raw`
#let data = json("resume.json")
#let b = data.basics
#let tpl = sys.inputs.at("template", default: "A")
#let accent = rgb("#1a3c7a")

#set document(title: b.at("name", default: "Resume"), author: b.at("name", default: ""))
#set page(paper: "us-letter", margin: (x: 0.65in, y: 0.6in))
#set text(font: "Libertinus Serif", size: 10pt, lang: "en")
#set par(justify: false, leading: 0.58em)

#let sectionheading(title) = {
  v(0.55em)
  text(size: 9.5pt, weight: "bold", tracking: 0.09em, fill: if tpl == "B" { accent } else { black })[#upper(title)]
  v(-0.3em)
  line(length: 100%, stroke: 0.5pt + (if tpl == "B" { accent } else { rgb("#999999") }))
  v(0.1em)
}

#let daterange(a, c) = {
  let parts = ()
  if a != "" { parts.push(a) }
  if c != "" { parts.push(c) }
  parts.join(" - ")
}

#let contactline = {
  let bits = ()
  if b.at("email", default: "") != "" { bits.push(b.email) }
  if b.at("phone", default: "") != "" { bits.push(b.phone) }
  if "location" in b {
    let city = b.location.at("city", default: "")
    let region = b.location.at("region", default: "")
    if city != "" { bits.push(if region != "" { city + ", " + region } else { city }) }
  }
  if b.at("url", default: "") != "" { bits.push(b.url) }
  for p in b.at("profiles", default: ()) {
    if p.at("url", default: "") != "" { bits.push(p.url) }
  }
  bits.join("  •  ")
}

// ---- Header. Contact sits in the BODY, never a page-header object (ATS rule).
#let header = {
  text(size: 19pt, weight: "bold")[#b.at("name", default: "")]
  if b.at("label", default: "") != "" {
    linebreak()
    text(size: 11pt)[#b.label]
  }
  if contactline != "" {
    linebreak()
    text(size: 8.5pt)[#contactline]
  }
}

#if tpl == "B" {
  block(fill: rgb("#eef2f7"), inset: (x: 1.1em, y: 0.9em), radius: 4pt, width: 100%,
        stroke: (left: 3pt + accent))[#header]
} else {
  header
}

#if b.at("summary", default: "") != "" {
  sectionheading("Summary")
  b.summary
}

#if data.at("work", default: ()).len() > 0 {
  sectionheading("Work Experience")
  for w in data.work {
    block(width: 100%, breakable: true)[
      #grid(columns: (1fr, auto), align: (left, right),
        text(weight: "bold")[#w.at("position", default: "")#if w.at("name", default: "") != "" [, #w.name]],
        text(size: 9pt, fill: rgb("#555555"))[#daterange(w.at("startDate", default: ""), w.at("endDate", default: ""))]
      )
      #if w.at("location", default: "") != "" [#text(size: 9pt, style: "italic")[#w.location]]
      #if w.at("summary", default: "") != "" [#par[#w.summary]]
      #if w.at("highlights", default: ()).len() > 0 [
        #list(indent: 0.5em, spacing: 0.45em, ..w.highlights)
      ]
      #v(0.35em)
    ]
  }
}

#if data.at("education", default: ()).len() > 0 {
  sectionheading("Education")
  for e in data.education {
    block(width: 100%, breakable: false)[
      #grid(columns: (1fr, auto), align: (left, right),
        text(weight: "bold")[#e.at("studyType", default: "")#if e.at("area", default: "") != "" [, #e.area]],
        text(size: 9pt, fill: rgb("#555555"))[#daterange(e.at("startDate", default: ""), e.at("endDate", default: ""))]
      )
      #if e.at("institution", default: "") != "" [#text(size: 9pt, style: "italic")[#e.institution]]
      #v(0.3em)
    ]
  }
}

#if data.at("skills", default: ()).len() > 0 {
  sectionheading("Skills")
  for s in data.skills {
    text(weight: "bold")[#s.at("name", default: ""): ]
    [#s.at("keywords", default: ()).join(", ")]
    linebreak()
  }
}

#if data.at("certificates", default: ()).len() > 0 {
  sectionheading("Certifications")
  for c in data.certificates {
    [#c.at("name", default: "")#if c.at("issuer", default: "") != "" [ - #c.issuer]#if c.at("date", default: "") != "" [ (#c.date)]]
    linebreak()
  }
}

#if data.at("projects", default: ()).len() > 0 {
  sectionheading("Projects")
  for p in data.projects {
    block(width: 100%, breakable: false)[
      #text(weight: "bold")[#p.at("name", default: "")]
      #if p.at("description", default: "") != "" [#par[#p.description]]
      #if p.at("highlights", default: ()).len() > 0 [
        #list(indent: 0.5em, spacing: 0.45em, ..p.highlights)
      ]
      #v(0.3em)
    ]
  }
}
`;
