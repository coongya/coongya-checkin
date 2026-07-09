// 이메일 발송 — Resend API 사용 (RESEND_API_KEY 필요).
// 키가 없으면(로컬 개발) 서버 콘솔에 내용을 출력한다.

export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      console.error("RESEND_API_KEY가 없어 이메일을 보낼 수 없어요.");
      return false;
    }
    console.log(`\n📧 [개발용 메일] to=${to} subject=${subject}\n${text}\n`);
    return true;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM ?? "쿵야출근단 <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
