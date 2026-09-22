import { z } from "zod";

export const smokeRequestSchema = z.object({
  input: z.string().trim().min(1).max(600),
});

export async function parseSmokeRequest(
  request: Request,
): Promise<z.infer<typeof smokeRequestSchema>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > 2_048) throw new Error("REQUEST_TOO_LARGE");
  const body = await request.text();
  if (body.length > 2_048) throw new Error("REQUEST_TOO_LARGE");
  return smokeRequestSchema.parse(JSON.parse(body));
}
