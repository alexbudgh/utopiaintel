export async function POST(request) {
  const formData = await request.formData();

  // Raw content of game div
  const dataHtml = formData.get("data_html");

  // Content from game div as if user had copy pasted
  const dataSimple = formData.get("data_simple");

  // Url from where data came from (useful for parsing)
  const url = formData.get("url");

  // Province that sent intel (will be different when sitting)
  const province = formData.get("prov");

  // Key (restrict access per kingdom or user)
  const key = formData.get("key");

  //
  // Your parse functions here
  //

  return Response.json({ success: true });
}

// Handle CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Max-Age": "1000",
    },
  });
}
