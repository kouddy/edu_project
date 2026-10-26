import { getAttempt, getSheet } from "@/lib/store";
import { signPhotoUrl } from "@/lib/sign";
import { notFound } from "next/navigation";
import PageBreadcrumbs from "../../PageBreadcrumbs";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Divider,
  Image,
  Link,
  Progress,
} from "@heroui/react";
import type { QuestionStatus } from "@/lib/types";

const STATUS_CHIP: Record<QuestionStatus, "success" | "danger" | "warning"> = {
  correct: "success",
  wrong: "danger",
  unsure: "warning",
};

export default async function AttemptPage({
  params,
}: {
  params: { id: string };
}) {
  const attempt = await getAttempt(params.id);
  if (!attempt) notFound();
  const sheet = await getSheet(attempt.sheetId);

  const total = attempt.items.length;
  const correct = attempt.items.filter((i) => i.status === "correct").length;
  const wrong = attempt.items.filter((i) => i.status === "wrong").length;
  const unsure = attempt.items.filter((i) => i.status === "unsure").length;
  const scorePct = total === 0 ? 0 : Math.round((correct / total) * 100);

  return (
    <div className="flex flex-col gap-6">
      <PageBreadcrumbs trail={[{ label: "Home", href: "/" }, { label: "Attempt" }]} />

      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          {sheet?.title ?? attempt.sheetId}
        </h1>
        <p className="text-[15px] text-default-600">
          {new Date(attempt.createdAt).toLocaleString(undefined, {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      </div>

      {attempt.rejectionReason ? (
        <div className="flex flex-col gap-6">
          <Alert
            color="danger"
            title="This photo needs a retake"
            description={attempt.rejectionReason}
          />
          <Card className="p-2">
            <CardHeader className="px-5 pb-1 pt-4">
              <h2 className="text-xl font-extrabold tracking-tight">
                Tips for a gradable photo
              </h2>
            </CardHeader>
            <CardBody className="flex flex-col gap-3 px-5 pb-5">
              <ul className="flex list-disc flex-col gap-1 pl-5 text-[15px] text-default-600">
                <li>Flatten the sheet so nothing is folded or curled.</li>
                <li>Include all four corners of the page.</li>
                <li>Retake in bright, even light without shadows.</li>
              </ul>
              <Image
                src={signPhotoUrl(attempt.photoFile)}
                alt="Uploaded worksheet photo"
                radius="lg"
                classNames={{ wrapper: "w-full", img: "max-h-96 w-full object-contain" }}
              />
              <div>
                <Button as={Link} href="/" color="primary">
                  Upload again
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <Card className="p-2">
            <CardBody className="flex flex-col gap-4 px-5 py-5">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-4xl font-extrabold tracking-tight">
                    {correct}
                    <span className="text-2xl font-bold text-default-400">
                      /{total}
                    </span>
                  </p>
                  <p className="text-[15px] text-default-600">questions correct</p>
                </div>
                <div className="flex gap-1.5">
                  <Chip size="sm" color="success" variant="flat">
                    {correct} correct
                  </Chip>
                  <Chip size="sm" color="danger" variant="flat">
                    {wrong} wrong
                  </Chip>
                  <Chip size="sm" color="warning" variant="flat">
                    {unsure} unsure
                  </Chip>
                </div>
              </div>
              <Progress
                aria-label={`${scorePct}% correct`}
                value={scorePct}
                color={unsure > 0 ? "warning" : scorePct >= 70 ? "success" : "danger"}
                showValueLabel
              />
              {unsure > 0 ? (
                <p className="text-[15px] text-default-600">
                  {unsure} {unsure === 1 ? "answer was" : "answers were"} hard to
                  read — please check {unsure === 1 ? "it" : "them"} together below.
                </p>
              ) : null}
              {wrong > 0 ? (
                <div>
                  <Button as={Link} href="/review" color="primary" variant="flat">
                    Practice {wrong} missed {wrong === 1 ? "question" : "questions"}
                  </Button>
                </div>
              ) : null}
            </CardBody>
          </Card>

          <Card className="p-2">
            <CardHeader className="px-5 pb-1 pt-4">
              <h2 className="text-xl font-extrabold tracking-tight">Worksheet photo</h2>
            </CardHeader>
            <CardBody className="px-5 pb-5">
              <Image
                src={signPhotoUrl(attempt.photoFile)}
                alt="Uploaded worksheet photo"
                radius="lg"
                classNames={{ wrapper: "w-full", img: "max-h-96 w-full object-contain" }}
              />
            </CardBody>
          </Card>

          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-extrabold tracking-tight">
              Per-question results
            </h2>
            {attempt.items.map((item) => {
              const key = sheet?.answerKey.find((k) => k.qid === item.qid);
              return (
                <Card key={item.qid} className="p-2">
                  <CardBody className="flex flex-col gap-2 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[16px]">
                        <span className="font-bold">{item.qid}</span>
                        {key ? (
                          <span className="text-default-600"> — {key.prompt}</span>
                        ) : null}
                      </p>
                      <Chip
                        size="sm"
                        color={STATUS_CHIP[item.status]}
                        variant="flat"
                        className="capitalize"
                      >
                        {item.status}
                      </Chip>
                    </div>
                    <Divider />
                    <p className="text-[15px] leading-relaxed">{item.explanation}</p>
                    {item.modelReading ? (
                      <p className="text-sm text-default-500">
                        Read as: {item.modelReading}
                      </p>
                    ) : null}
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
