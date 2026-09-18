// Shared resume types (imported by server and client code via relative paths)

export interface ResumeProject {
  name: string;
  tech: string;
  bullets: string[];
}

export interface ResumeExperience {
  company: string;
  role: string;
  period: string;
  bullets: string[];
}

export interface ResumeEducation {
  degree: string;
  institution: string;
  period: string;
  details: string;
}

export interface ResumeData {
  owner: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  summary: string;
  skills: string[];
  projects: ResumeProject[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
}

export interface TailoringResult {
  summary: string;
  skills: string[];
  projects: ResumeProject[];
  experience: ResumeExperience[];
  education: ResumeEducation[];
  keywordsAdded: string[];
  atsNotes: string;
}

export interface TailoringMeta {
  base_resume_id: number;
  job_title: string;
  company: string;
  provider: string;
  model: string;
  generated_at: string;
}
