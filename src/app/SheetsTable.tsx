"use client";

import {
  Chip,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";

export interface SheetRow {
  id: string;
  title: string;
  subject: string;
  grade: number;
  questionCount: number;
}

// Client component on purpose: HeroUI collection items (TableColumn, TableRow,
// TableCell) must be created on the client. Elements created in a Server
// Component cross the wire as client references, which the collection builder
// cannot read ("Unknown element <[object Object]> in collection").
export default function SheetsTable({ sheets }: { sheets: SheetRow[] }) {
  if (sheets.length === 0) {
    return <p className="text-[15px] text-default-600">No sheets seeded yet.</p>;
  }
  return (
    <Table aria-label="Available sheets" removeWrapper>
      <TableHeader>
        <TableColumn>TITLE</TableColumn>
        <TableColumn>GRADE</TableColumn>
        <TableColumn>QUESTIONS</TableColumn>
      </TableHeader>
      <TableBody>
        {sheets.map((s) => (
          <TableRow key={s.id}>
            <TableCell>
              <span className="font-semibold">{s.title}</span>
              <span className="block text-sm font-normal capitalize text-default-500">
                {s.subject}
              </span>
            </TableCell>
            <TableCell>
              <Chip size="sm" variant="flat">
                Grade {s.grade}
              </Chip>
            </TableCell>
            <TableCell>{s.questionCount}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
