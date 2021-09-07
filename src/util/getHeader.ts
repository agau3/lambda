export default function (name: string, headers?: { [name: string]: string }): string | undefined {
  if (headers) {
    for (const headerName in headers) {
      if (headerName.toLowerCase() === name.toLowerCase()) {
        return headers[headerName]
      }
    }
  }
  return undefined
}