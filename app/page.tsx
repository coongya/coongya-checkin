import { redirect } from "next/navigation";
import { getAuthed } from "@/lib/auth";
import AuthForms from "@/components/AuthForms";

export default async function Home() {
  const auth = await getAuthed();
  if (auth) redirect("/dashboard");

  return (
    <main className="container" style={{ paddingTop: 32 }}>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/kungya/main.png"
          alt="쿵야출근단"
          style={{ width: 220, maxWidth: "70%", height: "auto" }}
        />
        <h1 style={{ fontSize: 30, fontWeight: 800, margin: "10px 0 6px" }}>쿵야출근단</h1>
        <p className="muted">
          사진 한 장으로 출근 도장 쿵! <br />
          지각 벌금과 출근 통계를 쿵야들과 함께 기록해요.
        </p>
      </div>
      <AuthForms />
    </main>
  );
}
