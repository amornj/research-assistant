import { NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export async function GET() {
  try {
    const cli = process.env.NLM_CLI_PATH
    if (!cli) {
      return NextResponse.json([])
    }
    const { stdout } = await execFileAsync(cli, ['notebook', 'list', '--json'], { timeout: 120000 })
    return NextResponse.json(JSON.parse(stdout))
  } catch (error) {
    return NextResponse.json([])
  }
}
