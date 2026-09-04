import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import os from 'os';

export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  try {
    const platform = os.platform();

    if (platform === 'darwin') {
      const script = `osascript -e 'try' -e 'set chosen to choose folder with prompt "Pilih Folder Penyimpanan Foto MingleBooth"' -e 'return POSIX path of chosen' -e 'on error' -e 'return "CANCELED"' -e 'end try'`;

      return new Promise<NextResponse>((resolve) => {
        exec(script, (err, stdout) => {
          if (err) {
            resolve(
              NextResponse.json(
                { canceled: true, error: err.message },
                { status: 200, headers: corsHeaders }
              )
            );
            return;
          }
          const result = stdout.trim();
          if (result === 'CANCELED' || !result) {
            resolve(
              NextResponse.json(
                { canceled: true },
                { status: 200, headers: corsHeaders }
              )
            );
          } else {
            resolve(
              NextResponse.json(
                { canceled: false, selectedPath: result.replace(/\/$/, '') },
                { status: 200, headers: corsHeaders }
              )
            );
          }
        });
      });
    } else if (platform === 'win32') {
      const psCommand = `powershell -NoProfile -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.windows.forms') | Out-Null; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Pilih Folder Penyimpanan Foto'; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $f.SelectedPath } else { Write-Output 'CANCELED' }"`;

      return new Promise<NextResponse>((resolve) => {
        exec(psCommand, (err, stdout) => {
          if (err) {
            resolve(
              NextResponse.json(
                { canceled: true, error: err.message },
                { status: 200, headers: corsHeaders }
              )
            );
            return;
          }
          const result = stdout.trim();
          if (result === 'CANCELED' || !result) {
            resolve(
              NextResponse.json(
                { canceled: true },
                { status: 200, headers: corsHeaders }
              )
            );
          } else {
            resolve(
              NextResponse.json(
                { canceled: false, selectedPath: result },
                { status: 200, headers: corsHeaders }
              )
            );
          }
        });
      });
    } else {
      // Linux zenity fallback
      return new Promise<NextResponse>((resolve) => {
        exec('zenity --file-selection --directory --title="Pilih Folder Penyimpanan Foto"', (err, stdout) => {
          if (err) {
            resolve(
              NextResponse.json(
                { canceled: true },
                { status: 200, headers: corsHeaders }
              )
            );
          } else {
            resolve(
              NextResponse.json(
                { canceled: false, selectedPath: stdout.trim() },
                { status: 200, headers: corsHeaders }
              )
            );
          }
        });
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { canceled: true, error: err?.message },
      { status: 500, headers: corsHeaders }
    );
  }
}
