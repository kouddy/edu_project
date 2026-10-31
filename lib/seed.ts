/**
 * Seed data, with two consumers:
 *
 * - The server registry (lib/server/registry.ts), which grades the
 *   seeded sheets below — Gina's Week 12 set and friends — alongside
 *   the book catalogue, so a photo of one grades the same way wherever
 *   it is filed.
 * - The demo account constants (DEMO_PARENT / DEMO_KIDS /
 *   DEMO_EMAIL) that lib/store.ts seeds the demo database from.
 *
 * Gina's Math · Week 12 answer key is the interactive prototype's demo sheet,
 * extracted verbatim from the interactive prototype
 * (prompts, correct answers, topics where the prototype defines them, and the
 * Q4 explanation are the prototype's exact strings; explanations/topics for
 * the remaining questions are equivalent Grade 4 seed content).
 *
 * The remaining sheets (Weeks 10/11, Word Problems, Set C) are composed
 * Grade 4 math sets in the same spirit, each with a full 10-question key.
 */

import type { AnswerKey, Kid, Parent, Sheet } from "./store";
import { BOOK_W12_KEYS, BOOK_W12_SHEETS } from "./book-gina-w12";

export const SEED_KIDS: Kid[] = [
  { id: "kid-gina", parentId: "parent-david", name: "Gina", grade: 4, subject: "Math" },
  { id: "kid-leo", parentId: "parent-david", name: "Leo", grade: 1, subject: "Math" },
];

/**
 * Demo mode's account: a parent with two kids whose packets and
 * marking history lib/demo.ts layers on, so the app opens the way a
 * real account looks mid-term.
 */
export const DEMO_PARENT: Parent = {
  id: "parent-demo",
  name: "Demo",
};

export const DEMO_KIDS: Kid[] = [
  { id: "kid-amy", parentId: DEMO_PARENT.id, name: "Amy", grade: 3, subject: "Math" },
  { id: "kid-bob", parentId: DEMO_PARENT.id, name: "Bob", grade: 4, subject: "Math" },
];

/** The demo account's sign-in email — a fake address for a fake account. */
export const DEMO_EMAIL = "demo@example.com";

export const GINA_MATH_W12 = "sheet-gina-math-w12";
const GINA_MATH_W11 = "sheet-gina-math-w11";
const GINA_MATH_W10 = "sheet-gina-math-w10";
const GINA_WP_SETB = "sheet-gina-wp-setb";
const GINA_WP_W12 = "sheet-gina-wp-w12";
export const GINA_MATH_SETC = "sheet-gina-math-setc";
const LEO_MATH_W12 = "sheet-leo-math-w12";

export const SEED_SHEETS: Sheet[] = [
  {
    id: GINA_MATH_W12,
    kidId: "kid-gina",
    subject: "Math",
    week: 12,
    printedCode: "G4-MATH-W12-A",
    topic: "Mixed practice: addition, subtraction, multiplication",
  },
  {
    id: GINA_WP_W12,
    kidId: "kid-gina",
    subject: "Word Problems",
    week: 12,
    printedCode: "G4-WP-W12-A",
    topic: "Read, choose the operation, solve — including two-step problems",
  },
  {
    id: GINA_MATH_W11,
    kidId: "kid-gina",
    subject: "Math",
    week: 11,
    printedCode: "G4-MATH-W11-A",
    topic: "Multiplication and division facts",
  },
  {
    id: GINA_MATH_W10,
    kidId: "kid-gina",
    subject: "Math",
    week: 10,
    printedCode: "G4-MATH-W10-A",
    topic: "Addition and subtraction to 1,000",
  },
  {
    id: GINA_WP_SETB,
    kidId: "kid-gina",
    subject: "Word Problems",
    week: 11,
    setName: "Set B",
    printedCode: "G4-WP-SETB",
    topic: "Word problems: one and two steps",
  },
  {
    id: GINA_MATH_SETC,
    kidId: "kid-gina",
    subject: "Math",
    week: 12,
    setName: "Set C",
    printedCode: "G4-MATH-SETC",
    topic: "Mixed practice set",
  },
  {
    id: LEO_MATH_W12,
    kidId: "kid-leo",
    subject: "Math",
    week: 12,
    printedCode: "G1-MATH-W12-A",
    topic: "Counting and adding to 20",
  },
  // Gina's real Week 12 book packet (lib/book-gina-w12.ts) is part of the
  // seed so her homework is the actual packet the hub hands out.
  ...BOOK_W12_SHEETS,
];

const W12_KEY: AnswerKey = {
  sheetId: GINA_MATH_W12,
  questions: [
    {
      number: 1,
      prompt: "48 + 37",
      correctAnswer: "85",
      explanation:
        "Add the ones first: 8 + 7 = 15, write 5 and carry 1. Then 4 + 3 + 1 = 8 — so it's 85.",
      topic: "Addition with regrouping",
      isReview: false,
    },
    {
      number: 2,
      prompt: "63 − 28",
      correctAnswer: "35",
      explanation: "Borrow first: 13 − 8 = 5, then 5 − 2 = 3 — so it's 35.",
      topic: "Borrowing in subtraction",
      isReview: false,
    },
    {
      number: 3,
      prompt: "7 × 8",
      correctAnswer: "56",
      explanation: "7 × 8 = 56 — that's 7 groups of 8.",
      topic: "Multiplication facts",
      isReview: true,
    },
    {
      number: 4,
      prompt: "52 − 27",
      correctAnswer: "25",
      explanation:
        "Close! You took the smaller digit from the bigger one in each column. For 52 − 27, borrow first: 12 − 7 = 5, then 4 − 2 = 2 — so it's 25.",
      topic: "Borrowing in subtraction",
      isReview: false,
    },
    {
      number: 5,
      prompt: "9 × 6",
      correctAnswer: "54",
      explanation: "9 × 6 = 54 — it's one less than 10 × 6 = 60.",
      topic: "Multiplication facts",
      isReview: false,
    },
    {
      number: 6,
      prompt: "34 × 2",
      correctAnswer: "68",
      explanation:
        "Multiply the ones first: 4 × 2 = 8, then the tens: 3 × 2 = 6 — so 34 × 2 = 68.",
      topic: "2-digit × 1-digit multiplication",
      isReview: false,
    },
    {
      number: 7,
      prompt: "125 + 248",
      correctAnswer: "373",
      explanation:
        "Line up the columns: 5 + 8 = 13 (write 3, carry 1), 2 + 4 + 1 = 7, 1 + 2 = 3 — so it's 373.",
      topic: "Three-digit addition",
      isReview: false,
    },
    {
      number: 8,
      prompt: "90 ÷ 10",
      correctAnswer: "9",
      explanation: "90 ÷ 10 = 9 — dividing by 10 drops the zero.",
      topic: "Division facts",
      isReview: true,
    },
    {
      number: 9,
      prompt: "74 − 38",
      correctAnswer: "36",
      explanation: "Borrow first: 14 − 8 = 6, then 6 − 3 = 3 — so 74 − 38 = 36.",
      topic: "Borrowing in subtraction",
      isReview: false,
    },
    {
      number: 10,
      prompt: "15 × 4",
      correctAnswer: "60",
      explanation: "15 × 4: 10 × 4 = 40 and 5 × 4 = 20, and 40 + 20 = 60.",
      topic: "2-digit × 1-digit multiplication",
      isReview: false,
    },
  ],
};

const W11_KEY: AnswerKey = {
  sheetId: GINA_MATH_W11,
  questions: [
    { number: 1, prompt: "6 × 7", correctAnswer: "42", explanation: "6 × 7 = 42 — 6 groups of 7.", topic: "Multiplication facts", isReview: false },
    { number: 2, prompt: "48 ÷ 6", correctAnswer: "8", explanation: "48 ÷ 6 = 8, because 6 × 8 = 48.", topic: "Division facts", isReview: false },
    { number: 3, prompt: "23 × 4", correctAnswer: "92", explanation: "23 × 4: 20 × 4 = 80 and 3 × 4 = 12, and 80 + 12 = 92.", topic: "2-digit × 1-digit multiplication", isReview: false },
    { number: 4, prompt: "9 × 9", correctAnswer: "81", explanation: "9 × 9 = 81 — it's 9 × 10 = 90 minus one more 9.", topic: "Multiplication facts", isReview: true },
    { number: 5, prompt: "56 ÷ 7", correctAnswer: "8", explanation: "56 ÷ 7 = 8, because 7 × 8 = 56.", topic: "Division facts", isReview: false },
    {
      number: 6,
      prompt: "14 × 5",
      correctAnswer: "70",
      explanation: "Careful — 14 × 5 isn't 60. Split it up: 10 × 5 = 50 and 4 × 5 = 20, and 50 + 20 = 70.",
      topic: "2-digit × 1-digit multiplication",
      isReview: false,
    },
    { number: 7, prompt: "81 ÷ 9", correctAnswer: "9", explanation: "81 ÷ 9 = 9, because 9 × 9 = 81.", topic: "Division facts", isReview: true },
    { number: 8, prompt: "7 × 12", correctAnswer: "84", explanation: "7 × 12: 7 × 10 = 70 and 7 × 2 = 14, and 70 + 14 = 84.", topic: "2-digit × 1-digit multiplication", isReview: false },
    { number: 9, prompt: "96 ÷ 8", correctAnswer: "12", explanation: "96 ÷ 8 = 12, because 8 × 12 = 96.", topic: "Division facts", isReview: false },
    { number: 10, prompt: "18 × 3", correctAnswer: "54", explanation: "18 × 3: 10 × 3 = 30 and 8 × 3 = 24, and 30 + 24 = 54.", topic: "2-digit × 1-digit multiplication", isReview: false },
  ],
};

const W10_KEY: AnswerKey = {
  sheetId: GINA_MATH_W10,
  questions: [
    { number: 1, prompt: "356 + 247", correctAnswer: "603", explanation: "Ones: 6 + 7 = 13 (write 3, carry 1). Tens: 5 + 4 + 1 = 10 (write 0, carry 1). Hundreds: 3 + 2 + 1 = 6 — so it's 603.", topic: "Three-digit addition", isReview: false },
    { number: 2, prompt: "900 − 375", correctAnswer: "525", explanation: "Borrow across the zeros: 10 − 5 = 5, 9 − 7 = 2, 8 − 3 = 5 — so it's 525.", topic: "Borrowing in subtraction", isReview: false },
    {
      number: 3,
      prompt: "482 + 199",
      correctAnswer: "681",
      explanation: "Watch the carry: ones 2 + 9 = 11 (write 1, carry 1), tens 8 + 9 + 1 = 18 (write 8, carry 1), hundreds 4 + 1 + 1 = 6 — so it's 681, not 671.",
      topic: "Addition with regrouping",
      isReview: false,
    },
    { number: 4, prompt: "704 − 268", correctAnswer: "436", explanation: "Borrow first: 14 − 8 = 6, 9 − 6 = 3, 6 − 2 = 4 — so it's 436.", topic: "Borrowing in subtraction", isReview: false },
    { number: 5, prompt: "129 + 586", correctAnswer: "715", explanation: "Ones: 9 + 6 = 15 (write 5, carry 1). Tens: 2 + 8 + 1 = 11 (write 1, carry 1). Hundreds: 1 + 5 + 1 = 7 — so it's 715.", topic: "Three-digit addition", isReview: true },
    { number: 6, prompt: "1000 − 640", correctAnswer: "360", explanation: "1000 − 640 = 360 — count up from 640: 640 + 360 = 1000.", topic: "Borrowing in subtraction", isReview: false },
    {
      number: 7,
      prompt: "275 + 378",
      correctAnswer: "653",
      explanation: "The ones carry matters: 5 + 8 = 13 (write 3, carry 1), then 7 + 7 + 1 = 15 (write 5, carry 1), then 2 + 3 + 1 = 6 — so it's 653, not 643.",
      topic: "Addition with regrouping",
      isReview: false,
    },
    { number: 8, prompt: "831 − 457", correctAnswer: "374", explanation: "Borrow first: 11 − 7 = 4, 12 − 5 = 7, 7 − 4 = 3 — so it's 374.", topic: "Borrowing in subtraction", isReview: true },
    { number: 9, prompt: "64 + 78", correctAnswer: "142", explanation: "Ones: 4 + 8 = 12 (write 2, carry 1). Tens: 6 + 7 + 1 = 14 — so it's 142.", topic: "Addition with regrouping", isReview: false },
    { number: 10, prompt: "512 − 286", correctAnswer: "226", explanation: "Borrow first: 12 − 6 = 6, 10 − 8 = 2, 4 − 2 = 2 — so it's 226.", topic: "Borrowing in subtraction", isReview: false },
  ],
};

const SETB_KEY: AnswerKey = {
  sheetId: GINA_WP_SETB,
  questions: [
    { number: 1, prompt: "Sara has 4 boxes with 6 pencils in each box. How many pencils in all?", correctAnswer: "24", explanation: "4 × 6 = 24 pencils.", topic: "Word problems: multiplication", isReview: false },
    { number: 2, prompt: "A baker made 48 muffins. He packs 8 in each tray. How many trays does he fill?", correctAnswer: "6", explanation: "48 ÷ 8 = 6 trays.", topic: "Word problems: division", isReview: false },
    { number: 3, prompt: "Tom had 35 marbles. He bought 27 more. How many marbles does he have now?", correctAnswer: "62", explanation: "35 + 27 = 62 marbles.", topic: "Word problems: addition", isReview: false },
    { number: 4, prompt: "90 students are split into 9 equal groups. How many students are in each group?", correctAnswer: "10", explanation: "90 ÷ 9 = 10 students in each group.", topic: "Word problems: division", isReview: true },
    { number: 5, prompt: "A book has 120 pages. Mia has read 45 pages. How many pages are left?", correctAnswer: "75", explanation: "120 − 45 = 75 pages left.", topic: "Word problems: subtraction", isReview: false },
    { number: 6, prompt: "Each shelf holds 7 books. There are 8 shelves. How many books are there in all?", correctAnswer: "56", explanation: "7 × 8 = 56 books.", topic: "Word problems: multiplication", isReview: false },
    { number: 7, prompt: "Ben picked 63 apples. He packs 9 apples in each bag. How many bags does he use?", correctAnswer: "7", explanation: "63 ÷ 9 = 7 bags.", topic: "Word problems: division", isReview: false },
    { number: 8, prompt: "A class has 5 rows of 6 chairs. How many chairs are there in all?", correctAnswer: "30", explanation: "5 × 6 = 30 chairs.", topic: "Word problems: multiplication", isReview: true },
    { number: 9, prompt: "Nina had 84 stickers. She gave 29 to her friend. How many stickers does she have left?", correctAnswer: "55", explanation: "84 − 29 = 55 stickers left.", topic: "Word problems: subtraction", isReview: false },
    { number: 10, prompt: "There are 3 teams with 11 players on each team. How many players are there in all?", correctAnswer: "33", explanation: "3 × 11 = 33 players.", topic: "Word problems: multiplication", isReview: false },
  ],
};

const WP12_KEY: AnswerKey = {
  sheetId: GINA_WP_W12,
  questions: [
    { number: 1, prompt: "4 boxes hold 12 pencils each — how many pencils in all?", correctAnswer: "48", explanation: "Each box has 12 pencils, so multiply: 4 × 12 = 48.", topic: "Multiplication", isReview: false },
    { number: 2, prompt: "Mia collected 96 shells, then gave 28 away — how many left?", correctAnswer: "68", explanation: "Start with 96 and take away 28: 96 − 28 = 68.", topic: "Subtraction", isReview: false },
    { number: 3, prompt: "5 shelves with 9 books on each — how many books?", correctAnswer: "45", explanation: "5 shelves of 9 books: 5 × 9 = 45.", topic: "Multiplication", isReview: false },
    { number: 4, prompt: "A baker made 72 muffins and packed them in boxes of 8 — how many boxes?", correctAnswer: "9", explanation: "Share 72 into groups of 8: 72 ÷ 8 = 9 boxes.", topic: "Division", isReview: false },
    { number: 5, prompt: "Tom ran 350 m on Monday and 275 m on Tuesday — total distance?", correctAnswer: "625 m", explanation: "Add the two days: 350 + 275 = 625 m.", topic: "Addition", isReview: true },
    { number: 6, prompt: "Noah buys 3 packs of 8 markers and gives 5 markers away — how many markers does he have left?", correctAnswer: "19", explanation: "This one has two steps! First work out 3 × 8 = 24 markers, then take away the 5 he gave away: 24 − 5 = 19. Gina stopped after the first step and wrote 24.", topic: "Two-step word problems", isReview: false },
    { number: 7, prompt: "48 students split into 6 equal teams — how many on each team?", correctAnswer: "8", explanation: "48 ÷ 6 = 8 on each team.", topic: "Division", isReview: false },
    { number: 8, prompt: "A rope is 2 m long, cut into 4 equal pieces — each piece", correctAnswer: "50 cm", explanation: "2 m is 200 cm. Split into 4 equal pieces: 200 ÷ 4 = 50 cm.", topic: "Measurement", isReview: false },
    { number: 9, prompt: "Sara had $50 and spent $17 on a game — how much left?", correctAnswer: "$33", explanation: "50 − 17 = 33 dollars left.", topic: "Subtraction", isReview: true },
    { number: 10, prompt: "7 vans carry 8 children each — how many children?", correctAnswer: "56", explanation: "7 × 8 = 56 children.", topic: "Multiplication", isReview: false },
  ],
};

const SETC_KEY: AnswerKey = {
  sheetId: GINA_MATH_SETC,
  questions: [
    { number: 1, prompt: "73 + 48", correctAnswer: "121", explanation: "Ones: 3 + 8 = 11 (write 1, carry 1). Tens: 7 + 4 + 1 = 12 — so it's 121.", topic: "Addition with regrouping", isReview: false },
    { number: 2, prompt: "95 − 37", correctAnswer: "58", explanation: "Borrow first: 15 − 7 = 8, then 8 − 3 = 5 — so it's 58.", topic: "Borrowing in subtraction", isReview: false },
    { number: 3, prompt: "8 × 6", correctAnswer: "48", explanation: "8 × 6 = 48.", topic: "Multiplication facts", isReview: true },
    { number: 4, prompt: "42 × 3", correctAnswer: "126", explanation: "42 × 3: 40 × 3 = 120 and 2 × 3 = 6, and 120 + 6 = 126.", topic: "2-digit × 1-digit multiplication", isReview: false },
    { number: 5, prompt: "264 + 379", correctAnswer: "643", explanation: "Ones: 4 + 9 = 13 (write 3, carry 1). Tens: 6 + 7 + 1 = 14 (write 4, carry 1). Hundreds: 2 + 3 + 1 = 6 — so it's 643.", topic: "Three-digit addition", isReview: false },
    { number: 6, prompt: "72 ÷ 9", correctAnswer: "8", explanation: "72 ÷ 9 = 8, because 9 × 8 = 72.", topic: "Division facts", isReview: false },
    {
      number: 7,
      prompt: "506 − 278",
      correctAnswer: "228",
      explanation: "Borrow across the zero: 16 − 8 = 8, 9 − 7 = 2, 4 − 2 = 2 — so it's 228, not 238.",
      topic: "Borrowing in subtraction",
      isReview: false,
    },
    { number: 8, prompt: "11 × 7", correctAnswer: "77", explanation: "11 × 7 = 77.", topic: "Multiplication facts", isReview: true },
    { number: 9, prompt: "58 + 66", correctAnswer: "124", explanation: "Ones: 8 + 6 = 14 (write 4, carry 1). Tens: 5 + 6 + 1 = 12 — so it's 124.", topic: "Addition with regrouping", isReview: false },
    { number: 10, prompt: "130 − 45", correctAnswer: "85", explanation: "Borrow first: 10 − 5 = 5, 12 − 4 = 8 — so it's 85.", topic: "Borrowing in subtraction", isReview: false },
  ],
};

const LEO_W12_KEY: AnswerKey = {
  sheetId: LEO_MATH_W12,
  questions: [
    {
      number: 1,
      prompt: "3 + 4",
      correctAnswer: "7",
      explanation: "Count on from 3: 4, 5, 6, 7 — so 3 + 4 = 7.",
      topic: "Addition to 10",
      isReview: true,
    },
    {
      number: 2,
      prompt: "6 + 5",
      correctAnswer: "11",
      explanation: "Make a ten first: 6 + 4 = 10, plus 1 more is 11.",
      topic: "Adding to 20",
      isReview: false,
    },
    {
      number: 3,
      prompt: "9 + 8",
      correctAnswer: "17",
      explanation: "Take 1 from the 8 to make 10, then 10 + 7 = 17.",
      topic: "Adding to 20",
      isReview: false,
    },
    {
      number: 4,
      prompt: "12 − 4",
      correctAnswer: "8",
      explanation: "Count back from 12: 11, 10, 9, 8 — so 12 − 4 = 8.",
      topic: "Subtracting within 20",
      isReview: false,
    },
    {
      number: 5,
      prompt: "7 + 7",
      correctAnswer: "14",
      explanation: "7 + 7 is a double — two groups of 7 make 14.",
      topic: "Doubles",
      isReview: true,
    },
    {
      number: 6,
      prompt: "15 − 6",
      correctAnswer: "9",
      explanation: "Count back from 15: 14, 13, 12, 11, 10, 9 — so 15 − 6 = 9.",
      topic: "Subtracting within 20",
      isReview: false,
    },
    {
      number: 7,
      prompt: "10 + 5",
      correctAnswer: "15",
      explanation: "10 and 5 more is 15.",
      topic: "Adding to 20",
      isReview: false,
    },
    {
      number: 8,
      prompt: "9 − 5",
      correctAnswer: "4",
      explanation: "Count back from 9: 8, 7, 6, 5, 4 — so 9 − 5 = 4.",
      topic: "Subtraction to 10",
      isReview: true,
    },
    {
      number: 9,
      prompt: "8 + 6",
      correctAnswer: "14",
      explanation: "Make a ten: 8 + 2 = 10, plus 4 more is 14.",
      topic: "Adding to 20",
      isReview: false,
    },
    {
      number: 10,
      prompt: "18 − 9",
      correctAnswer: "9",
      explanation: "9 is half of 18, so 18 − 9 = 9.",
      topic: "Subtracting within 20",
      isReview: false,
    },
  ],
};

export const SEED_ANSWER_KEYS: AnswerKey[] = [W12_KEY, W11_KEY, W10_KEY, SETB_KEY, WP12_KEY, SETC_KEY, LEO_W12_KEY, ...BOOK_W12_KEYS];

/* ------------------------------------------------- demo grade patterns
 * The scripted grading provider's verdict patterns for the seeded
 * sheets: when a photo of one is "marked" without a real provider,
 * these are the results it produces. For confident verdicts the read
 * answer is what the child wrote; the wrong ones are plausible slips,
 * each matched by the key's explanation.
 */

type ConfidentGrade = {
  questionNumber: number;
  verdict: "correct" | "wrong";
  confidence: number;
  readAnswer: string;
};

function grades(key: AnswerKey, wrongReads: Record<number, string>): ConfidentGrade[] {
  return key.questions.map((q) => {
    const wrong = wrongReads[q.number];
    return wrong
      ? { questionNumber: q.number, verdict: "wrong" as const, confidence: 0.94, readAnswer: wrong }
      : { questionNumber: q.number, verdict: "correct" as const, confidence: 0.98, readAnswer: q.correctAnswer };
  });
}

/** The Week 12 demo verdict pattern: 7 correct, Q4 wrong, Q6 + Q9 unsure. */
export const W12_DEMO_GRADES = [
  { questionNumber: 1, verdict: "correct" as const, confidence: 0.99, readAnswer: "85" },
  { questionNumber: 2, verdict: "correct" as const, confidence: 0.98, readAnswer: "35" },
  { questionNumber: 3, verdict: "correct" as const, confidence: 0.99, readAnswer: "56" },
  { questionNumber: 4, verdict: "wrong" as const, confidence: 0.93, readAnswer: "35" },
  { questionNumber: 5, verdict: "correct" as const, confidence: 0.99, readAnswer: "54" },
  { questionNumber: 6, verdict: "unsure" as const, confidence: 0.55, readAnswer: "68" },
  { questionNumber: 7, verdict: "correct" as const, confidence: 0.98, readAnswer: "373" },
  { questionNumber: 8, verdict: "correct" as const, confidence: 0.99, readAnswer: "9" },
  { questionNumber: 9, verdict: "unsure" as const, confidence: 0.5, readAnswer: "36" },
  { questionNumber: 10, verdict: "correct" as const, confidence: 0.98, readAnswer: "60" },
];

/** Set C's pattern when it is scanned in: 9 correct, Q7 wrong, nothing unsure. */
export const SETC_DEMO_GRADES = grades(SETC_KEY, { 7: "238" });
