import { POST as handlePost } from "./route-implementation";

export async function POST(request: Request) {
  return handlePost(request);
}
