export type QuestionStatus = "correct" | "wrong" | "unsure";

export interface AnswerKeyItem {
  qid: string;
  prompt: string;
  answer: string;
  points?: number;
}

export interface Sheet {
  id: string;
  grade: number;
  subject: string;
  title: string;
  sourcePdf: string;
  answerKey: AnswerKeyItem[];
}

export interface AttemptItem {
  qid: string;
  status: QuestionStatus;
  confidence: number;
  modelReading: string | null;
  explanation: string;
}

export interface Attempt {
  id: string;
  sheetId: string;
  photoFile: string;
  createdAt: string;
  rejectionReason: string | null;
  items: AttemptItem[];
}

export interface ReviewItem {
  id: string;
  sheetId: string;
  qid: string;
  attemptId: string;
  dueAt: string;
  done: boolean;
  createdAt: string;
}

export const REVIEW_OFFSETS_DAYS = [1, 7, 30];
