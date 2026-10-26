"use client";

import { useEffect, useState } from "react";
import {
  Accordion,
  AccordionItem,
  Alert,
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Input,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { newId, store } from "@/lib/browser-store";
import type { Child, Sheet } from "@/lib/product-types";

export default function ProductLibrary() {
  const [children, setChildren] = useState<Child[] | null>(null);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("3");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        await store.seedIfEmpty();
        const [c, s] = await Promise.all([store.listChildren(), store.listSheets()]);
        if (live) {
          setChildren(c);
          setSheets(s);
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : "Failed to load library.");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  async function addChild(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    const gradeNum = Number(grade);
    if (!trimmed || !Number.isFinite(gradeNum)) return;
    setError(null);
    try {
      await store.saveChild({ id: newId("child"), name: trimmed, grade: gradeNum });
      setChildren(await store.listChildren());
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save child.");
    }
  }

  if (children === null || sheets === null) {
    return (
      <Card className="p-2">
        <CardBody className="flex flex-row items-center gap-3 px-5 py-6">
          <Spinner size="sm" />
          <p className="text-[15px] text-default-600">Loading children and sheets…</p>
        </CardBody>
      </Card>
    );
  }

  const sample = sheets.find((s) => s.sheetCode === "G3-MATH-TEST-A") ?? sheets[0];

  return (
    <section className="flex flex-col gap-6">
      <Card className="p-2">
        <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
          <h2 className="text-xl font-extrabold tracking-tight">Family library</h2>
          <p className="text-[15px] text-default-600">
            Children and worksheets, read through the store interface.
          </p>
        </CardHeader>
        <CardBody className="flex flex-col gap-5 px-5 pb-5">
          {error ? (
            <Alert color="danger" title="Something went wrong" description={error} />
          ) : null}

          <div>
            <h3 className="mb-2 text-base font-bold">Children</h3>
            {children.length === 0 ? (
              <p className="text-[15px] text-default-600">
                No children yet — add one below.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {children.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2"
                  >
                    <Avatar name={c.name} size="sm" />
                    <span className="text-[15px] font-semibold">{c.name}</span>
                    <Chip size="sm" variant="flat">
                      Grade {c.grade}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
            <form
              onSubmit={addChild}
              className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <Input
                label="Name"
                placeholder="e.g. Maya"
                value={name}
                onValueChange={setName}
                className="sm:max-w-xs"
              />
              <Select
                label="Grade"
                selectedKeys={[grade]}
                onSelectionChange={(keys) => {
                  const next = keys === "all" ? undefined : Array.from(keys)[0];
                  if (next !== undefined) setGrade(String(next));
                }}
                className="sm:max-w-[120px]"
              >
                {[1, 2, 3, 4, 5, 6].map((g) => (
                  <SelectItem key={String(g)}>{String(g)}</SelectItem>
                ))}
              </Select>
              <Button type="submit" color="primary" isDisabled={!name.trim()}>
                Add child
              </Button>
            </form>
          </div>

          <Divider />

          <div>
            <h3 className="mb-2 text-base font-bold">Sheets</h3>
            {sheets.length === 0 ? (
              <p className="text-[15px] text-default-600">No sheets seeded yet.</p>
            ) : (
              <Table aria-label="Library sheets" removeWrapper>
                <TableHeader>
                  <TableColumn>CODE</TableColumn>
                  <TableColumn>GRADE</TableColumn>
                  <TableColumn>SUBJECT</TableColumn>
                  <TableColumn>WEEK</TableColumn>
                  <TableColumn>QUESTIONS</TableColumn>
                </TableHeader>
                <TableBody>
                  {sheets.map((s) => (
                    <TableRow key={s.sheetCode}>
                      <TableCell>
                        <span className="font-semibold">{s.sheetCode}</span>
                      </TableCell>
                      <TableCell>{s.grade}</TableCell>
                      <TableCell className="capitalize">{s.subject}</TableCell>
                      <TableCell>{s.week}</TableCell>
                      <TableCell>{s.questions.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardBody>
      </Card>

      {sample ? (
        <Card className="p-2">
          <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
            <h2 className="text-xl font-extrabold tracking-tight">
              Seeded sheet: {sample.sheetCode}
            </h2>
            <div className="flex flex-wrap gap-1.5 pt-1">
              <Chip size="sm" variant="flat">
                Grade {sample.grade}
              </Chip>
              <Chip size="sm" variant="flat" className="capitalize">
                {sample.subject}
              </Chip>
              <Chip size="sm" variant="flat">
                {sample.week}
              </Chip>
            </div>
          </CardHeader>
          <CardBody className="px-5 pb-5">
            <Accordion variant="bordered">
              {sample.questions.map((q) => (
                <AccordionItem
                  key={q.questionNumber}
                  aria-label={`Question ${q.questionNumber}`}
                  title={
                    <span className="text-[15px]">
                      <span className="font-bold">Q{q.questionNumber}.</span> {q.prompt}
                    </span>
                  }
                >
                  <p className="pb-2 text-[15px]">
                    Answer: <span className="font-semibold">{q.correctAnswer}</span>{" "}
                    <span className="text-default-500">[{q.topic}]</span>
                  </p>
                </AccordionItem>
              ))}
            </Accordion>
          </CardBody>
        </Card>
      ) : null}
    </section>
  );
}
