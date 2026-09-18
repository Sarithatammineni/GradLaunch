import { describe, expect, it } from "vitest";
import { parseResumeText, echoTailoring } from "../server/lib/resume";
import { relevanceScore, extractSkills, normalizeWorkMode, normalizeEmploymentType, extractDeadline } from "../server/lib/jobs";
import { extractDocxText, buildMinimalDocx, isDocxFile } from "../server/lib/docx";
import { buildReminders, daysUntil, type UpcomingEventRow, type DeadlineRow } from "../server/lib/reminders";
import { isStatusId, stageProgress, STATUSES } from "../shared/status";
import type { ResumeData } from "../shared/resume";

const SAMPLE_RESUME = `Ananya Sharma
Final-year CSE student
ananya@example.com | +91 98765 43210 | Hyderabad

Summary
Final-year Computer Science student with full-stack experience.

Education
B.Tech CSE | NIT Warangal | 2022-2026

Skills
python, java, sql, react, node.js, docker

Experience
SWE Intern | FinEdge Labs | (2025)
- Built REST APIs in Node.js used by 40 users
- Cut nightly SQL job from 3 hours to 40 minutes

Projects
PlaceMe Tracker | react, node.js
- Full-stack app to track placement applications`;

describe("resume parsing", () => {
  const parsed = parseResumeText(SAMPLE_RESUME, { fullName: "Ananya Sharma", email: "ananya@example.com", phone: null, gradYear: 2026 });

  it("extracts contact info", () => {
    expect(parsed.email).toBe("ananya@example.com");
    expect(parsed.phone).toContain("98765");
  });

  it("extracts skills", () => {
    expect(parsed.skills).toContain("python");
    expect(parsed.skills).toContain("react");
  });

  it("extracts summary", () => {
    expect(parsed.summary).toContain("Computer Science student");
  });

  it("extracts education rows", () => {
    expect(parsed.education.length).toBeGreaterThanOrEqual(1);
    expect(parsed.education[0]!.degree).toContain("B.Tech");
  });

  it("extracts experience with bullets", () => {
    expect(parsed.experience.length).toBeGreaterThanOrEqual(1);
    expect(parsed.experience[0]!.company).toBe("SWE Intern");
    expect(parsed.experience[0]!.bullets.length).toBe(2);
  });

  it("extracts projects with tech", () => {
    expect(parsed.projects.length).toBeGreaterThanOrEqual(1);
    expect(parsed.projects[0]!.name).toBe("PlaceMe Tracker");
    expect(parsed.projects[0]!.bullets.length).toBe(1);
  });
});

describe("echo tailoring", () => {
  const resume: ResumeData = {
    owner: "Ananya Sharma",
    headline: "CSE student",
    email: "a@example.com",
    phone: "",
    location: "",
    links: [],
    summary: "Final-year CS student.",
    skills: ["python", "react", "sql", "docker"],
    projects: [],
    experience: [],
    education: []
  };

  it("prioritizes skills that appear in the JD and labels itself honestly", () => {
    const out = echoTailoring(resume, {
      title: "Backend Engineer",
      company: "Acme",
      description: "Looking for python and docker experience. SQL a plus."
    });
    expect(out.skills.slice(0, 3).sort()).toEqual(["docker", "python", "sql"]);
    expect(out.summary).toContain("TEMPLATE TAILORING");
    expect(out.summary).toContain("Acme");
    expect(out.keywordsAdded).toContain("python");
  });

  it("keeps education and experience untouched (no fabrication)", () => {
    const out = echoTailoring(resume, { title: "X", company: "Y", description: "z" });
    expect(out.education).toEqual(resume.education);
    expect(out.experience).toEqual(resume.experience);
  });
});

describe("job normalization + relevance", () => {
  it("normalizes work modes and employment types", () => {
    expect(normalizeWorkMode("Remote (work from home)")).toBe("remote");
    expect(normalizeWorkMode("Hybrid - 3 days in office")).toBe("hybrid");
    expect(normalizeWorkMode("Bengaluru on-site")).toBe("onsite");
    expect(normalizeEmploymentType("Summer Internship 2026")).toBe("internship");
    expect(normalizeEmploymentType("Full-time SDE")).toBe("full_time");
  });

  it("extracts skill keywords and ISO deadlines", () => {
    const skills = extractSkills("Must know React, TypeScript and AWS; Docker nice to have");
    expect(skills).toContain("react");
    expect(skills).toContain("typescript");
    expect(skills).toContain("aws");
    expect(extractDeadline("Apply before 2026-03-01")).toBe("2026-03-01");
  });

  const job = {
    id: 1,
    source: "greenhouse",
    source_job_id: "g:1",
    company: "Stripe",
    title: "Software Engineer, Backend",
    location: "Bengaluru",
    work_mode: "onsite",
    employment_type: "full_time",
    experience_level: "entry",
    url: "https://x",
    apply_url: "https://x",
    description: "Backend systems",
    skills: "java,spring boot,sql",
    salary: null,
    first_seen_at: new Date().toISOString(),
    deadline_at: null,
    published_at: new Date().toISOString(),
    expired: 0,
    is_active: 1
  } as any;

  function makeJob(overrides: Partial<typeof job>): typeof job {
    return { ...job, ...overrides } as typeof job;
  }

  it("scores jobs against profile skills and preferences with reasons", () => {
    const scored = relevanceScore({
      skills: "java, sql, react",
      preferredDomains: "backend",
      preferredRoles: "software engineer; sde",
      preferredLocations: "bengaluru",
      gradYear: 2026,
      employmentPreference: "full_time"
    }, job);

    expect(scored.matched_skills.sort()).toEqual(["java", "sql"]);
    expect(scored.missing_skills).toContain("spring boot");
    expect(scored.match_reasons.some((r) => r.includes("Matches your skills"))).toBe(true);
    expect(scored.score).toBeGreaterThan(0);
  });

  it("gives zero-ish score to unrelated profiles", () => {
    const scored = relevanceScore({
      skills: "fpga, verilog",
      preferredDomains: "vlsi",
      preferredRoles: "hardware engineer",
      preferredLocations: "chennai",
      gradYear: 2026,
      employmentPreference: ""
    }, job);
    expect(scored.matched_skills).toHaveLength(0);
    expect(scored.score).toBeLessThan(10);
  });

  it("uses graduation year: boosts jobs open to the user's grad year", () => {
    const j = makeJob({ description: "Hiring graduates from the 2026 batch. Backend systems." });
    const scored = relevanceScore({ skills: "", preferredDomains: "", preferredRoles: "", preferredLocations: "", gradYear: 2026, employmentPreference: "" }, j);
    expect(scored.match_reasons.some((r) => r.includes("Open to your graduation year (2026)"))).toBe(true);
    const sameWithoutGradYear = relevanceScore({ skills: "", preferredDomains: "", preferredRoles: "", preferredLocations: "", gradYear: null, employmentPreference: "" }, j);
    expect(scored.score).toBeGreaterThan(sameWithoutGradYear.score);
  });

  it("uses graduation year: flags and penalizes mismatched grad years", () => {
    const thisYear = new Date().getFullYear();
    const j = makeJob({ description: `Only open to candidates graduating in ${thisYear + 2}. Backend systems.` });
    const scored = relevanceScore({ skills: "", preferredDomains: "", preferredRoles: "", preferredLocations: "", gradYear: thisYear, employmentPreference: "" }, j);
    expect(scored.match_reasons.some((r) => r.includes("verify eligibility"))).toBe(true);
    const sameWithoutGradYear = relevanceScore({ skills: "", preferredDomains: "", preferredRoles: "", preferredLocations: "", gradYear: null, employmentPreference: "" }, j);
    expect(scored.score).toBeLessThan(sameWithoutGradYear.score);
  });

  it("does not penalize when the posting mentions no grad-year-like numbers", () => {
    const j = makeJob({ description: "Great backend team working on payments infrastructure." });
    const scored = relevanceScore({ skills: "", preferredDomains: "", preferredRoles: "", preferredLocations: "", gradYear: 2026, employmentPreference: "" }, j);
    expect(scored.match_reasons.some((r) => r.includes("graduation year"))).toBe(false);
  });
});

describe("status metadata", () => {
  it("recognizes all statuses", () => {
    for (const s of ["interested", "applied", "shortlisted", "interview_scheduled", "offer_received", "accepted", "rejected", "withdrawn"]) {
      expect(isStatusId(s)).toBe(true);
    }
    expect(isStatusId("hired_lol")).toBe(false);
  });

  it("maps statuses to funnel stages", () => {
    expect(stageProgress("applied")).toBe(0);
    expect(stageProgress("shortlisted")).toBe(2);
    expect(stageProgress("interview_scheduled")).toBe(3);
    expect(stageProgress("offer_received")).toBe(4);
    expect(STATUSES.rejected.stage).toBe("closed");
  });
});

describe("docx parsing", () => {
  it("detects docx files by mime or extension", () => {
    expect(isDocxFile("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "r.docx")).toBe(true);
    expect(isDocxFile("application/octet-stream", "resume.DOCX")).toBe(true);
    expect(isDocxFile("application/pdf", "resume.pdf")).toBe(false);
    expect(isDocxFile("text/plain", "notes.txt")).toBe(false);
  });

  it("round-trips text through buildMinimalDocx and extractDocxText", () => {
    const paragraphs = [
      "Ananya Sharma",
      "ananya@example.com | +91 98765 43210 | Hyderabad",
      "Skills: python, java, sql, react",
      "PlaceMe Tracker | react, node.js",
      "- Full-stack app to track placement applications"
    ];
    const bytes = buildMinimalDocx(paragraphs);
    const text = extractDocxText(bytes);
    for (const p of paragraphs) expect(text).toContain(p);
  });

  it("parses docx text into a structured resume via parseResumeText", () => {
    const docxText = extractDocxText(buildMinimalDocx([
      "Test Docx User",
      "test.docx@example.com",
      "Skills",
      "python, docker, sql",
      "Projects",
      "Demo | python",
      "- Built a thing"
    ]));
    const parsed = parseResumeText(docxText, { fullName: "Test Docx User", email: "x@y.z", phone: null, gradYear: null });
    expect(parsed.skills).toContain("python");
    expect(parsed.skills).toContain("docker");
    expect(parsed.projects[0]?.name).toBe("Demo");
  });

  it("rejects non-zip bytes and zip files without word/document.xml", () => {
    expect(() => extractDocxText(new TextEncoder().encode("definitely not a zip"))).toThrow();
    // Rename the central-directory copy of word/document.xml -> word/document.xnl
    // (same length) so the package no longer contains the expected part.
    const bytes = buildMinimalDocx(["hello"]);
    const needle = new TextEncoder().encode("word/document.xml");
    let last = -1;
    for (let i = 0; i + needle.length <= bytes.length; i++) {
      let match = true;
      for (let k = 0; k < needle.length; k++) if (bytes[i + k] !== needle[k]) { match = false; break; }
      if (match) last = i;
    }
    expect(last).toBeGreaterThan(0);
    bytes[last + 12] = 110; // 'm' -> 'n'
    expect(() => extractDocxText(bytes)).toThrow(/document\.xml/);
  });
});

describe("reminder engine", () => {
  const today = "2026-09-18";

  it("computes whole-day deltas", () => {
    expect(daysUntil("2026-09-18", today)).toBe(0);
    expect(daysUntil("2026-09-19", today)).toBe(1);
    expect(daysUntil("2026-09-15", today)).toBe(-3);
  });

  const events: UpcomingEventRow[] = [
    { id: 1, application_id: 11, title: "Panel interview", event_type: "interview", event_date: "2026-09-20", event_time: "15:30", notes: "", completed: 0, app_company: "Acme", app_job_title: "SDE" },
    { id: 2, application_id: null, title: "OA coding test", event_type: "coding_test", event_date: "2026-09-18", event_time: "10:00", notes: "", completed: 0 },
    { id: 3, application_id: null, title: "Old past event outside window", event_type: "other", event_date: "2026-09-01", event_time: "", notes: "", completed: 0 },
    { id: 4, application_id: null, title: "Completed event is skipped", event_type: "interview", event_date: "2026-09-19", event_time: "", notes: "", completed: 1 }
  ];
  const deadlines: DeadlineRow[] = [
    { id: 21, company: "Globex", job_title: "Data Analyst", deadline_at: "2026-09-21", status: "applied" },
    { id: 22, company: "Initech", job_title: "QA Engineer", deadline_at: "2026-09-17", status: "ready_to_apply" }
  ];

  it("builds reminders inside the 7-day horizon, most urgent first", () => {
    const out = buildReminders(events, deadlines, today);
    // Past event (17 days ago) and completed event excluded; the rest present.
    expect(out.some((r) => r.title.includes("Old past event"))).toBe(false);
    expect(out.some((r) => r.title.includes("Completed event"))).toBe(false);
    expect(out.filter((r) => r.source === "event")).toHaveLength(2);
    expect(out.filter((r) => r.source === "application_deadline")).toHaveLength(2);
    // Sorted by days_until ascending.
    const days = out.map((r) => r.days_until);
    expect([...days].sort((a, b) => a - b)).toEqual(days);
  });

  it("labels urgency correctly (overdue / today / soon / upcoming)", () => {
    const out = buildReminders(events, deadlines, today);
    const byTitle = (t: string) => out.find((r) => r.title.includes(t))!;
    expect(byTitle("Initech").urgency).toBe("overdue");
    expect(byTitle("OA coding test").urgency).toBe("today");
    expect(byTitle("Globex").urgency).toBe("soon");
    expect(byTitle("Panel interview").urgency).toBe("soon");
  });

  it("excludes items beyond the horizon", () => {
    const far = [{ id: 5, application_id: null, title: "Far future interview", event_type: "interview", event_date: "2026-10-30", event_time: "", notes: "", completed: 0 }];
    expect(buildReminders(far, [], today)).toHaveLength(0);
  });

  it("includes overdue items within the horizon and marks them first", () => {
    const out = buildReminders([], deadlines, today);
    expect(out[0]!.urgency).toBe("overdue");
    expect(out[0]!.days_until).toBeLessThan(0);
  });
});
