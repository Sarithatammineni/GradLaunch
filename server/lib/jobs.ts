export type JobSourceId =
  | "greenhouse"
  | "workable"
  | "remotive"
  | "career_page"
  | "user";

export interface JobSourceMeta {
  id: JobSourceId;
  label: string;
  kind: "api" | "feed" | "manual";
  requires: string;
  docs?: string;
}

export const JOB_SOURCES: JobSourceMeta[] = [
  {
    id: "greenhouse",
    label: "Greenhouse job boards API (public per-board endpoints)",
    kind: "api",
    requires:
      "One or more public board tokens (e.g. 'stripe', 'airbnb'); public boards need no auth",
    docs: "https://developers.greenhouse.io/job-board.html"
  },
  {
    id: "workable",
    label: "Workable public jobs API",
    kind: "api",
    requires: "Workable account subdomain (public API, no key for public boards)",
    docs: "https://developers.workable.com/"
  },
  {
    id: "remotive",
    label: "Remotive public remote-jobs feed",
    kind: "feed",
    requires: "Nothing (public API); enable with REMOTIVE_ENABLED=true",
    docs: "https://remotive.com/remote-jobs/api"
  },
  {
    id: "career_page",
    label: "Company career pages (RSS/JSON feeds where permitted)",
    kind: "feed",
    requires:
      "A feed URL per company. Only add sources whose robots.txt/ToS permit automated access.",
  },
  {
    id: "user",
    label: "Manually added by users",
    kind: "manual",
    requires: "-"
  }
];

export interface RawJob {
  source: JobSourceId;
  sourceJobId: string;
  company: string;
  title: string;
  location: string;
  workMode: "remote" | "hybrid" | "onsite" | "unknown";
  employmentType: "internship" | "full_time" | "part_time" | "contract" | "other";
  experienceLevel: "internship" | "entry" | "mid" | "senior";
  url: string;
  applyUrl: string;
  description: string;
  skills: string[];
  salary: string | null;
  firstSeenAt: string;
  deadlineAt: string | null;
  publishedAt: string | null;
}

export interface StoredJob {
  id: number;
  source: string;
  source_job_id: string;
  company: string;
  title: string;
  location: string;
  work_mode: string;
  employment_type: string;
  experience_level: string;
  url: string;
  apply_url: string;
  description: string;
  skills: string;
  salary: string | null;
  first_seen_at: string;
  deadline_at: string | null;
  published_at: string | null;
  expired: 0 | 1;
  is_active: 0 | 1;
}

export interface JobWithScore extends StoredJob {
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  match_reasons: string[];
}

export function normalizeWorkMode(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("hybrid")) return "hybrid";
  if (t.includes("remote") && !t.includes("no remote")) return "remote";
  if (t.includes("on-site") || t.includes("onsite") || t.includes("in-office"))
    return "onsite";
  return "unknown";
}

export function normalizeEmploymentType(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("intern")) return "internship";
  if (t.includes("contract")) return "contract";
  if (t.includes("part")) return "part_time";
  if (t.includes("full")) return "full_time";
  return "other";
}

export function normalizeExperienceLevel(
  employmentType: string,
  text: string
): string {
  const t = text.toLowerCase();
  if (employmentType === "internship") return "internship";
  if (t.includes("senior") || t.includes("lead") || t.includes("principal"))
    return "senior";
  if (t.includes("mid-level") || t.includes("mid level")) return "mid";
  return "entry";
}

const TECH_SKILLS = [
  "python", "java", "javascript", "typescript", "react", "next.js", "node.js",
  "sql", "postgresql", "mysql", "mongodb", "aws", "gcp", "azure", "docker",
  "kubernetes", "linux", "git", "rest", "graphql", "c++", "c#", "go", "rust",
  "html", "css", "tailwind", "django", "flask", "fastapi", "spring boot",
  "kafka", "spark", "hadoop", "tableau", "power bi", "excel", "pandas",
  "numpy", "tensorflow", "pytorch", "scikit-learn", "nlp", "computer vision",
  "llm", "generative ai", "bash", "ansible", "terraform", "ci/cd", "jenkins",
  "data structures", "algorithms", "system design", "oop", "android",
  "kotlin", "swift", "ios", "flutter", "react native", "firebase",
  "machine learning", "deep learning", "devops", "sre", "qa", "selenium",
  "api", "microservices", "redis", "elasticsearch", "airflow", "dbt",
  "snowflake", "bigquery", "verilog", "matlab", "embedded c", "autocad",
  "solidworks", "etabs", "staad pro", "revit", "ansys", "c"
];

export function extractSkills(text: string): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>();
  for (const s of TECH_SKILLS) {
    if (t.includes(s)) found.add(s);
  }
  return [...found].sort();
}

export function extractDeadline(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

export async function fetchWithTimeout(url: string, init?: RequestInit, ms = 15000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        "User-Agent": "GradLaunch/0.1 (respectful aggregator; configurable per source)",
        ...(init?.headers ?? {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchGreenhouse(token: string): Promise<RawJob[]> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=true`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Greenhouse ${res.status} for board '${token}'`);
  const data = (await res.json()) as any;
  const jobs = (data?.jobs ?? []) as any[];
  const now = new Date().toISOString();
  return jobs.map((j) => {
    const content = j.content
      ? Buffer.from(j.content, "base64").toString("utf8")
      : "";
    const text = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const loc = (j.location?.name as string) || "";
    const title = j.title ?? "Untitled role";
    const employmentType = normalizeEmploymentType(`${title} ${text.slice(0, 1500)}`);
    return {
      source: "greenhouse",
      sourceJobId: `${token}:${j.id}`,
      company: token,
      title,
      location: loc,
      workMode: normalizeWorkMode(`${loc} ${title} ${text.slice(0, 500)}`),
      employmentType,
      experienceLevel: normalizeExperienceLevel(employmentType, title),
      url: j.absolute_url ?? "",
      applyUrl: j.absolute_url ?? "",
      description: text.slice(0, 6000),
      skills: extractSkills(`${title} ${text.slice(0, 4000)}`),
      salary: null,
      firstSeenAt: now,
      deadlineAt: extractDeadline(text.slice(0, 4000)),
      publishedAt: j.updated_at ?? j.first_published ?? null
    } as RawJob;
  });
}

export async function fetchWorkable(account: string): Promise<RawJob[]> {
  const url = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(account)}/jobs`;
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "", location: "", department: "", workType: "", remote: [] })
  });
  if (!res.ok) throw new Error(`Workable ${res.status} for account '${account}'`);
  const data = (await res.json()) as any;
  const jobs = (data?.jobs ?? []) as any[];
  const now = new Date().toISOString();
  return jobs.map((j) => {
    const loc = [j.location?.city, j.location?.region, j.location?.country]
      .filter(Boolean)
      .join(", ");
    const title = j.title ?? "Untitled role";
    const text = String(j.description ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const employmentType = normalizeEmploymentType(`${title} ${text.slice(0, 1000)}`);
    return {
      source: "workable",
      sourceJobId: `${account}:${j.shortcode}`,
      company: account,
      title,
      location: loc,
      workMode: normalizeWorkMode(`${loc} ${title} ${text.slice(0, 500)}`),
      employmentType,
      experienceLevel: normalizeExperienceLevel(employmentType, title),
      url: `https://apply.workable.com/${account}/j/${j.shortcode}`,
      applyUrl: `https://apply.workable.com/${account}/j/${j.shortcode}/apply`,
      description: text.slice(0, 6000),
      skills: extractSkills(`${title} ${text.slice(0, 4000)}`),
      salary: null,
      firstSeenAt: now,
      deadlineAt: null,
      publishedAt: j.published_on ?? null
    } as RawJob;
  });
}

export async function fetchRemotive(): Promise<RawJob[]> {
  const url = "https://remotive.com/api/remote-jobs";
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Remotive ${res.status}`);
  const data = (await res.json()) as any;
  const jobs = (data?.jobs ?? []) as any[];
  const now = new Date().toISOString();
  return jobs.map((j) => {
    const title = j.title ?? "Untitled role";
    const text = String(j.description ?? "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const employmentType = normalizeEmploymentType(`${title} ${text.slice(0, 1000)}`);
    return {
      source: "remotive",
      sourceJobId: `remotive:${j.id}`,
      company: j.company_name ?? "Unknown",
      title,
      location: j.candidate_required_location ?? "Remote",
      workMode: "remote",
      employmentType,
      experienceLevel: normalizeExperienceLevel(employmentType, title),
      url: j.url ?? "",
      applyUrl: j.url ?? "",
      description: text.slice(0, 6000),
      skills: extractSkills(`${title} ${text.slice(0, 4000)}`),
      salary: j.salary ?? null,
      firstSeenAt: now,
      deadlineAt: null,
      publishedAt: j.publication_date ?? null
    } as RawJob;
  });
}

export async function fetchCareerPageFeed(
  url: string,
  company?: string
): Promise<RawJob[]> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Career page feed ${res.status} for ${url}`);
  const ctype = res.headers.get("content-type") || "";
  const body = await res.text();
  const items: RawJob[] = [];
  const now = new Date().toISOString();
  const pick = (s: string) =>
    String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const looksJson =
    ctype.includes("json") ||
    body.trim().startsWith("{") ||
    body.trim().startsWith("[");

  if (looksJson) {
    let data: any;
    try {
      data = JSON.parse(body);
    } catch {
      return [];
    }
    const arr: any[] =
      Array.isArray(data) ? data :
      Array.isArray(data?.jobs) ? data.jobs :
      Array.isArray(data?.items) ? data.items :
      Array.isArray(data?.positions) ? data.positions : [];
    for (const it of arr) {
      const title = it.title ?? it.name ?? it.position ?? "Untitled role";
      const link = it.url ?? it.link ?? it.absolute_url ?? "";
      const text = pick(it.description ?? it.body ?? it.content ?? "");
      const location = it.location ?? it.location_name ?? "";
      const employmentType = normalizeEmploymentType(`${title} ${text.slice(0, 1000)}`);
      items.push({
        source: "career_page",
        sourceJobId: `feed:${link || title}`,
        company: company || it.company || "Unknown",
        title,
        location,
        workMode: normalizeWorkMode(`${location} ${title}`),
        employmentType,
        experienceLevel: normalizeExperienceLevel(employmentType, title),
        url: link,
        applyUrl: it.apply_url ?? link,
        description: text.slice(0, 6000),
        skills: extractSkills(`${title} ${text.slice(0, 4000)}`),
        salary: it.salary ?? null,
        firstSeenAt: now,
        deadlineAt: extractDeadline(text),
        publishedAt: it.published_at ?? it.date ?? it.updated_at ?? null
      } as RawJob);
    }
  } else {
    // Minimal RSS/Atom parsing (regex-based, dependency-free)
    const itemRe = /<(item|entry)[\s\S]*?<\/\1>/gi;
    const tag = (block: string, name: string) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
      if (!m) return "";
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    };
    for (const block of body.match(itemRe) ?? []) {
      const title = pick(tag(block, "title"));
      if (!title) continue;
      const href =
        tag(block, "link") ||
        block.match(/<link[^>]*href="([^"]+)"/i)?.[1] ||
        tag(block, "url") ||
        "";
      const text = pick(tag(block, "description") || tag(block, "content"));
      const location = pick(tag(block, "location"));
      const employmentType = normalizeEmploymentType(`${title} ${text.slice(0, 1000)}`);
      items.push({
        source: "career_page",
        sourceJobId: `feed:${href || title}`,
        company: company || "Unknown",
        title,
        location,
        workMode: normalizeWorkMode(`${location} ${title}`),
        employmentType,
        experienceLevel: normalizeExperienceLevel(employmentType, title),
        url: href,
        applyUrl: href,
        description: text.slice(0, 6000),
        skills: extractSkills(`${title} ${text.slice(0, 4000)}`),
        salary: null,
        firstSeenAt: now,
        deadlineAt: extractDeadline(text),
        publishedAt:
          tag(block, "pubDate") || tag(block, "updated") || tag(block, "published") || null
      } as RawJob);
    }
  }
  return items;
}

export function relevanceScore(
  profile: {
    skills: string | string[];
    preferredDomains: string;
    preferredRoles: string;
    preferredLocations: string;
    gradYear: number | null;
    employmentPreference: string;
  },
  job: StoredJob
): JobWithScore {
  const userSkills = Array.isArray(profile.skills)
    ? profile.skills.map((s) => s.toLowerCase().trim())
    : String(profile.skills ?? "")
        .split(",")
        .map((s) => s.toLowerCase().trim())
        .filter(Boolean);
  const jobSkills = job.skills
    ? job.skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const matched = userSkills.filter((s) => s && jobSkills.includes(s));
  const missing = jobSkills.filter((s) => !userSkills.includes(s));

  const domains = String(profile.preferredDomains ?? "").toLowerCase();
  const roles = String(profile.preferredRoles ?? "").toLowerCase();
  const locations = String(profile.preferredLocations ?? "").toLowerCase();
  const title = job.title.toLowerCase();
  const loc = job.location.toLowerCase();

  const reasons: string[] = [];
  let score = 0;
  if (matched.length) {
    score += matched.length * 12;
    reasons.push(`Matches your skills: ${matched.slice(0, 6).join(", ")}`);
  }
  if (domains) {
    const domainTerms = domains.split(/[;,]/).map((d) => d.trim()).filter(Boolean);
    if (domainTerms.some((d) => title.includes(d) || jobSkills.some((s) => s.includes(d)))) {
      score += 10;
      reasons.push("Aligns with your preferred domain");
    }
  }
  if (roles) {
    const roleTerms = roles.split(/[;,]/).map((r) => r.trim()).filter(Boolean);
    if (roleTerms.some((r) => title.includes(r))) {
      score += 10;
      reasons.push("Matches a preferred role");
    }
  }
  if (locations) {
    const locTerms = locations.split(/[;,]/).map((l) => l.trim()).filter(Boolean);
    if (locTerms.some((l) => loc.includes(l))) {
      score += 6;
      reasons.push("In a preferred location");
    }
  }
  const prefType = String(profile.employmentPreference ?? "").toLowerCase();
  if (
    (prefType.includes("intern") && job.employment_type === "internship") ||
    (prefType.includes("full") && job.employment_type === "full_time")
  ) {
    score += 8;
    reasons.push(
      `Matches your preference for ${job.employment_type === "internship" ? "internships" : "full-time roles"}`
    );
  }
  if (job.experience_level === "entry" || job.experience_level === "internship") {
    score += 4;
    reasons.push("Entry-level / internship friendly");
  }

  // Graduation-year eligibility hints (informational, never a hard gate —
  // the spec forbids claiming eligibility without verified requirements).
  const gradYear = profile.gradYear ?? null;
  if (gradYear != null && Number.isFinite(gradYear)) {
    const text = `${job.title} ${job.description.slice(0, 2000)}`.toLowerCase();
    const gradYearsInText = text.match(/\b(20\d{2})\b/g)?.map(Number) ?? [];
    const currentYear = new Date().getFullYear();
    // Years plausibly referenced as eligibility years (batch/grad years), not
    // random numbers: bounded around the current year.
    const candidateYears = [...new Set(gradYearsInText)].filter((y) => y >= currentYear - 1 && y <= currentYear + 3);
    if (candidateYears.length) {
      if (candidateYears.includes(gradYear)) {
        score += 6;
        reasons.push(`Open to your graduation year (${gradYear})`);
      } else {
        const nearest = candidateYears.reduce((a, b) => (Math.abs(b - gradYear) < Math.abs(a - gradYear) ? b : a));
        const gap = Math.abs(nearest - gradYear);
        if (gap === 1) {
          score -= 3;
          reasons.push(`Posting references graduation year ${nearest} — yours is ${gradYear}; verify eligibility`);
        } else if (gap > 1) {
          score -= 8;
          reasons.push(`Posting targets graduation year ${nearest}, not ${gradYear} — verify eligibility`);
        }
      }
    }
  }
  if (job.deadline_at) {
    const days = Math.ceil((Date.parse(job.deadline_at) - Date.now()) / 86400000);
    if (days >= 0 && days <= 14) {
      score += 3;
      reasons.push(`Deadline in ${days} day(s)`);
    }
  }
  return { ...job, score, matched_skills: matched, missing_skills: missing, match_reasons: reasons };
}
