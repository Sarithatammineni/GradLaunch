export * from "../../shared/resume";

import type { ResumeData, TailoringResult } from "../../shared/resume";

export interface ParsedProfile {
  fullName: string;
  email?: string | null;
  phone?: string | null;
  gradYear?: number | null;
}

/** Heuristic text resume parser: good enough to prefill the editor, never silently trusted. */
export function parseResumeText(text: string, profile?: ParsedProfile): ResumeData {
  const clean = text.replace(/\r/g, "");
  const lines = clean.split("\n").map((l) => l.trimEnd());
  const nonEmpty = lines.filter((l) => l.trim().length > 0);

  const email = clean.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? profile?.email ?? null;
  const phone = clean.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[0] ?? profile?.phone ?? null;
  const gradYear = clean.match(/\b(19|20)\d{2}\b/g)
    ?.map(Number)
    .filter((y) => y >= 2015 && y <= 2035)
    .sort((a, b) => b - a)[0] ?? profile?.gradYear ?? null;

  // Prefer the name printed on the resume itself; fall back to profile name.
  const firstLine = nonEmpty[0]?.trim() ?? "";
  const looksLikeName = firstLine.length > 0 && firstLine.length <= 60 && !firstLine.includes("@") && /^[\p{L}\p{M} .,'-]+$/u.test(firstLine);
  const owner = looksLikeName ? firstLine : (profile?.fullName || "Your Name");

  // Section splitting on common headings
  const sectionRe =
    /^(summary|objective|profile|professional summary|skills|technical skills|experience|work experience|professional experience|internship[s]?|projects?|education|certifications?|achievements?|links?|profiles?)\s*:?\s*$/i;
  const sections = new Map<string, string[]>();
  let current = "header";
  for (const line of lines) {
    const m = line.trim().match(sectionRe);
    if (m) {
      current = m[1]!.toLowerCase();
      if (!sections.has(current)) sections.set(current, []);
      continue;
    }
    const arr = sections.get(current) ?? [];
    arr.push(line);
    sections.set(current, arr);
  }

  const pick = (...names: string[]): string[] => {
    for (const n of names) {
      const s = sections.get(n);
      if (s && s.some((l) => l.trim())) return s;
    }
    return [];
  };

  const skillsLines = pick("skills", "technical skills");
  const skills = skillsLines
    .join(", ")
    .split(/[,;\u2022|]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40);

  const summaryLines = pick("summary", "objective", "profile", "professional summary");
  const summary = summaryLines.join(" ").trim();

  // Projects: expect "Name | tech" or "Name - tech" then bullets
  const projects: ResumeData["projects"] = [];
  const projectLines = pick("projects", "project");
  let curProject: ResumeData["projects"][number] | null = null;
  for (const line of projectLines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[\u2022\-*]/.test(t)) {
      if (curProject) curProject.bullets.push(t.replace(/^[\u2022\-*]\s*/, ""));
      continue;
    }
    if (curProject) projects.push(curProject);
    const [name, tech] = t.split(/\s*[|\u2013-]\s*(.+)/);
    curProject = { name: name.trim(), tech: (tech ?? "").trim(), bullets: [] };
  }
  if (curProject) projects.push(curProject);

  // Experience: "Company | Role | Period" or "Role at Company (Period)"
  const experience: ResumeData["experience"] = [];
  const expLines = pick("experience", "work experience", "professional experience", "internship", "internships");
  let curExp: ResumeData["experience"][number] | null = null;
  for (const line of expLines) {
    const t = line.trim();
    if (!t) continue;
    if (/^[\u2022\-*]/.test(t)) {
      if (curExp) curExp.bullets.push(t.replace(/^[\u2022\-*]\s*/, ""));
      continue;
    }
    if (curExp) experience.push(curExp);
    const periodMatch = t.match(/\(([^)]*(19|20)\d{2}[^)]*)\)|\b((19|20)\d{2}\s*[-\u2013]\s*((19|20)\d{2}|present|current))\b/i);
    const period = periodMatch ? (periodMatch[1] || periodMatch[3] || "").trim() : "";
    const withoutPeriod = period ? t.replace(periodMatch![0], "").trim() : t;
    const parts = withoutPeriod.split(/\s*[|\u2013]\s*/).map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      curExp = { company: parts[0]!, role: parts[1]!, period, bullets: [] };
    } else {
      curExp = { company: withoutPeriod, role: "", period, bullets: [] };
    }
  }
  if (curExp) experience.push(curExp);

  // Education: "Degree | Institution | Period"
  const education: ResumeData["education"] = [];
  const eduLines = pick("education");
  for (const line of eduLines) {
    const t = line.trim();
    if (!t || /^[\u2022\-*]/.test(t) === false && t.length > 120) continue;
    const parts = t.split(/\s*[|\u2013]\s*/).map((p) => p.trim());
    if (parts.length >= 2) {
      education.push({
        degree: parts[0]!,
        institution: parts[1]!,
        period: parts[2] ?? "",
        details: parts.slice(3).join(" | ")
      });
    } else if (education.length) {
      education[education.length - 1]!.details += ` ${t}`;
    } else {
      education.push({ degree: t, institution: "", period: "", details: "" });
    }
  }

  const linkLines = clean.match(/https?:\/\/\S+/g) ?? [];

  return {
    owner,
    headline: "",
    email: email ?? "",
    phone: phone ?? "",
    location: "",
    links: [...new Set(linkLines)].slice(0, 4),
    summary,
    skills: [...new Set(skills)].slice(0, 30),
    projects: projects.slice(0, 8),
    experience: experience.slice(0, 6),
    education: education.slice(0, 4)
  };
}

/** Deterministic, clearly-labelled template tailoring used when AI_PROVIDER=echo. */
export function echoTailoring(resume: ResumeData, job: { title: string; company: string; description: string }): TailoringResult {
  const jdWords = new Set(
    job.description
      .toLowerCase()
      .match(/[a-z][a-z+#./-]{1,}/g)
      ?.filter((w) => w.length > 2) ?? []
  );
  const matchedSkills = resume.skills.filter((s) => jdWords.has(s.toLowerCase()));
  const keywords = matchedSkills.slice(0, 8);

  return {
    summary:
      `[TEMPLATE TAILORING \u2014 set AI_PROVIDER in .env to enable full AI rewriting] ` +
      `${resume.owner} \u2014 applying for ${job.title} at ${job.company}. ` +
      (resume.summary || "Final-year student with hands-on project experience.") + " " +
      (keywords.length ? `Highlighted relevant skills: ${keywords.join(", ")}.` : ""),
    skills: [...matchedSkills, ...resume.skills.filter((s) => !matchedSkills.includes(s))],
    projects: resume.projects,
    experience: resume.experience,
    education: resume.education,
    keywordsAdded: keywords,
    atsNotes:
      "Deterministic template output: single-column, standard section headings, no tables or graphics. " +
      "Review and edit bullets before submitting."
  };
}
