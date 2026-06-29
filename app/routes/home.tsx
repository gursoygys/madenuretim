import type { Route } from "./+types/home";
import ProductionReport from "../components/ProductionReport";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "BG Ferrokrom Günlük Üretim Raporu" },
    { name: "description", content: "BG Ferrokrom Günlük Üretim Raporu" },
  ];
}

export default function Home() {
  return <ProductionReport />;
}
