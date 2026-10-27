import ProductLibrary from "./ProductLibrary";
import { Button, Card, CardBody, Link } from "@heroui/react";

const STEPS = [
  {
    title: "1. Add your children",
    body: "Tell us who's practicing and which grade they're in.",
  },
  {
    title: "2. Upload a finished sheet",
    body: "Photograph the worksheet and pick its sheet code.",
  },
  {
    title: "3. Get per-question results",
    body: "Kid-friendly explanations for misses, and spaced review for them.",
  },
];

export default function Home() {
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
        <div className="flex flex-col gap-2 pt-2 sm:flex-row">
          <Button as={Link} href="/dashboard" color="primary" size="lg">
            Go to dashboard
          </Button>
          <Button as={Link} href="/upload" variant="flat" size="lg">
            Upload a worksheet
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.title} className="p-2">
            <CardBody className="px-5 py-4">
              <p className="text-[16px] font-bold">{s.title}</p>
              <p className="mt-1 text-[15px] text-default-600">{s.body}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <ProductLibrary />
    </div>
  );
}
