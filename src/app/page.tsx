import UploadForm from "./UploadForm";
import ProductLibrary from "./ProductLibrary";
import SheetsTable from "./SheetsTable";
import { loadAttempts, loadReviews, loadSheets } from "@/lib/store";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Link,
} from "@heroui/react";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function Home() {
  const [sheets, attempts, reviews] = await Promise.all([
    loadSheets(),
    loadAttempts(),
    loadReviews(),
  ]);
  const now = new Date().toISOString();
  const due = reviews.filter((r) => !r.done && r.dueAt <= now);
  const graded = attempts.filter((a) => !a.rejectionReason).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 pt-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Practice sheets, grades 1–6
        </h1>
        <p className="max-w-2xl text-[16px] leading-relaxed text-default-600">
          Upload a photo of a finished worksheet and get per-question results with
          kid-friendly explanations. Anything unclear is marked{" "}
          <span className="font-semibold text-foreground">unsure</span> for you to
          check — never guessed.
        </p>
      </div>

      {due.length > 0 ? (
        <Alert
          color="warning"
          title={`${due.length} review${due.length === 1 ? "" : "s"} due`}
          description="Missed questions are waiting for spaced practice."
          endContent={
            <Button as={Link} href="/review" color="warning" variant="flat" size="sm">
              Review now
            </Button>
          }
        />
      ) : null}

      <Card className="p-2">
        <CardBody className="flex flex-row items-stretch justify-between gap-2 px-5 py-4">
          <div className="flex-1">
            <p className="text-3xl font-extrabold tracking-tight">{sheets.length}</p>
            <p className="text-sm text-default-600">Worksheets ready</p>
          </div>
          <Divider orientation="vertical" />
          <div className="flex-1 px-2">
            <p className="text-3xl font-extrabold tracking-tight">{due.length}</p>
            <p className="text-sm text-default-600">Reviews due</p>
          </div>
          <Divider orientation="vertical" />
          <div className="flex-1 px-2">
            <p className="text-3xl font-extrabold tracking-tight">{graded}</p>
            <p className="text-sm text-default-600">Sheets graded</p>
          </div>
        </CardBody>
      </Card>

      <UploadForm sheets={sheets.map((s) => ({ id: s.id, title: s.title }))} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="p-2 lg:col-span-3">
          <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
            <h2 className="text-xl font-extrabold tracking-tight">Available sheets</h2>
            <p className="text-[15px] text-default-600">
              Worksheets you can photograph and grade.
            </p>
          </CardHeader>
          <CardBody className="px-5 pb-5">
            <SheetsTable
              sheets={sheets.map((s) => ({
                id: s.id,
                title: s.title,
                subject: s.subject,
                grade: s.grade,
                questionCount: s.answerKey.length,
              }))}
            />
          </CardBody>
        </Card>

        <Card className="p-2 lg:col-span-2">
          <CardHeader className="flex-col items-start gap-1 px-5 pb-1 pt-4">
            <h2 className="text-xl font-extrabold tracking-tight">Recent attempts</h2>
            <p className="text-[15px] text-default-600">Latest uploads and results.</p>
          </CardHeader>
          <CardBody className="px-5 pb-5">
            {attempts.length === 0 ? (
              <p className="text-[15px] text-default-600">
                No uploads yet — grade your first sheet above.
              </p>
            ) : (
              <ul className="flex flex-col">
                {attempts.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <Link
                      href={`/attempts/${a.id}`}
                      color="foreground"
                      className="flex items-center justify-between gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-default-100"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold">
                          {sheets.find((s) => s.id === a.sheetId)?.title ?? a.sheetId}
                        </span>
                        <span className="block text-sm text-default-500">
                          {formatDate(a.createdAt)}
                        </span>
                      </span>
                      {a.rejectionReason ? (
                        <Chip size="sm" color="danger" variant="flat">
                          Retake
                        </Chip>
                      ) : (
                        <Chip size="sm" color="success" variant="flat">
                          Graded
                        </Chip>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <ProductLibrary />
    </div>
  );
}
