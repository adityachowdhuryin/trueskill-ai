import { NextResponse } from "next/server";

export async function POST(req: Request) {
    try {
        const { password } = await req.json();
        const correct = process.env.PASSWORD_GATE;

        if (!correct) {
            return NextResponse.json({ ok: false, error: "Server misconfigured" }, { status: 500 });
        }

        if (password === correct) {
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ ok: false }, { status: 401 });
    } catch {
        return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
    }
}
