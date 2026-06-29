import type { Route } from "./+types/home";
import Form from "../components/Form";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "BG Ferrokrom Günlük Üretim Raporu" },
    { name: "description", content: "BG Ferrokrom Günlük Üretim Raporu" },
  ];
}

export default function ReportEntry() {
const navigate = useNavigate();
  return <div className="bg-slate-100">
    <header className={[
          "bg-blue-950 px-4 pt-2 md:pb-4 md:pt-6 pb-5 sticky top-0 z-10 shadow-lg",
          "transition-transform duration-300 sm:translate-y-0"
        ].join(" ")}>
          <div className="flex justify-start gap-4">
            <div className="mt-1">
              <button onClick={() => navigate("/")} className="bg-blue-900 text-white text-sm py-2 px-2 w-full rounded-md">
                <ArrowLeft/>
              </button>
            </div>
            <div>
              <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-1">
                BG Ferrokrom
              </p>
              <h1 className="text-white text-xl font-bold">Günlük Üretim Raporu Girişi</h1>
            </div>
          </div>
      </header>

      <main>
        <Form onSuccess={() => navigate("/")} />
      </main>

  </div>;
}
