import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

function incrementConfusion(confusion, expected, predicted) {
  confusion[expected] ??= {}
  confusion[expected][predicted] = (confusion[expected][predicted] ?? 0) + 1
}

export function benchmarkReviewExport(data) {
  const moves = Array.isArray(data?.moves) ? data.moves : []
  const labeled = moves.filter((move) => move.expected)
  let matches = 0
  const mismatches = []
  const byExpected = {}
  const confusion = {}

  for (const move of labeled) {
    const expected = move.expected
    const predicted = move.predicted ?? 'missing'
    const matched = expected === predicted

    byExpected[expected] ??= { total: 0, matches: 0 }
    byExpected[expected].total += 1
    if (matched) {
      matches += 1
      byExpected[expected].matches += 1
    } else {
      mismatches.push({
        ply: move.ply,
        san: move.san ?? null,
        expected,
        predicted,
      })
    }
    incrementConfusion(confusion, expected, predicted)
  }

  return {
    total: labeled.length,
    matches,
    agreement: labeled.length === 0 ? 0 : matches / labeled.length,
    mismatches,
    byExpected,
    confusion,
  }
}

export function formatBenchmarkReport(report, target = 0.8) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`
  const lines = [
    `Agreement: ${percent(report.agreement)} (${report.matches}/${report.total})`,
    `Target: ${report.agreement >= target ? 'PASS' : 'FAIL'} (${report.agreement >= target ? '>=' : '<'}${percent(target)})`,
  ]

  if (report.mismatches.length > 0) {
    lines.push('', 'Mismatches:')
    for (const mismatch of report.mismatches.slice(0, 25)) {
      lines.push(
        `${mismatch.ply}. ${mismatch.san ?? '(unknown)'}: expected ${mismatch.expected}, predicted ${mismatch.predicted}`,
      )
    }
    if (report.mismatches.length > 25) {
      lines.push(`...and ${report.mismatches.length - 25} more`)
    }
  }

  return lines.join('\n')
}

async function main() {
  const fixturePath = process.argv[2]
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='))
  const target = targetArg ? Number(targetArg.slice('--target='.length)) : 0.8

  if (!fixturePath) {
    console.error('Usage: npm run benchmark -- <review-export.json> [--target=0.8]')
    process.exit(2)
  }

  const data = JSON.parse(await readFile(fixturePath, 'utf8'))
  const report = benchmarkReviewExport(data)
  console.log(formatBenchmarkReport(report, target))
  process.exit(report.agreement >= target ? 0 : 1)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
