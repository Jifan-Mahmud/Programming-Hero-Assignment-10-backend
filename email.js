const nodemailer = require("nodemailer");

// Create transporter if SMTP credentials are provided in .env, otherwise mock transporter
const createTransporter = () => {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return null;
};

const transporter = createTransporter();

// Dispatch email
async function sendPulseForgeEmail({ to, subject, html, text }) {
  try {
    if (!to) return { success: false, error: "Recipient email is missing" };

    if (transporter) {
      const info = await transporter.sendMail({
        from: process.env.SMTP_FROM || '"PulseForge Fitness" <notifications@pulseforge.com>',
        to,
        subject,
        text,
        html,
      });
      console.log(`[Email Dispatched] To: ${to} | MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } else {
      console.log(`[Email Logged/Simulated] To: ${to} | Subject: ${subject}`);
      return { success: true, simulated: true };
    }
  } catch (error) {
    console.error("[Email Dispatch Error]:", error.message);
    return { success: false, error: error.message };
  }
}

// Email Templates
function getBookingConfirmationEmailTemplate({ userName, className, schedule, amount, bookingId, trainerName }) {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
      <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: 1px;">⚡ PULSEFORGE</h1>
        <p style="margin: 6px 0 0; color: #ffedd5; font-size: 14px;">Official Workout Booking Confirmation</p>
      </div>
      <div style="padding: 28px;">
        <p style="font-size: 16px; color: #cbd5e1;">Hey <strong style="color: #f8fafc;">${userName || "Athlete"}</strong>,</p>
        <p style="font-size: 15px; color: #94a3b8; line-height: 1.6;">Your training session has been successfully booked and paid for. Get ready to push your boundaries!</p>
        
        <div style="background: #1e293b; border-radius: 8px; padding: 20px; margin: 24px 0; border: 1px solid #475569;">
          <h3 style="margin-top: 0; color: #f97316; font-size: 18px; border-bottom: 1px solid #334155; padding-bottom: 8px;">Session Overview</h3>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #cbd5e1;">Class:</strong> <span style="color: #f8fafc;">${className}</span></p>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #cbd5e1;">Trainer:</strong> <span style="color: #f8fafc;">${trainerName || "Certified Coach"}</span></p>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #cbd5e1;">Schedule:</strong> <span style="color: #f8fafc;">${schedule || "Upcoming Session"}</span></p>
          <p style="margin: 8px 0; font-size: 14px;"><strong style="color: #cbd5e1;">Amount Paid:</strong> <span style="color: #22c55e; font-weight: bold;">$${amount} (USD)</span></p>
          <p style="margin: 8px 0; font-size: 12px; color: #64748b;">Booking Reference: #${bookingId}</p>
        </div>

        <p style="font-size: 13px; color: #94a3b8;">You can view and download your full branded PDF invoice directly from your <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/booked-classes" style="color: #f97316; text-decoration: underline;">PulseForge Dashboard</a>.</p>
      </div>
      <div style="background: #020617; padding: 16px; text-align: center; border-top: 1px solid #1e293b;">
        <p style="margin: 0; font-size: 12px; color: #64748b;">© 2026 PulseForge Elite Fitness. All rights reserved.</p>
      </div>
    </div>
  `;
}

function getTrainerApplicationReviewEmailTemplate({ userName, status, feedback }) {
  const isApproved = status === "approved";
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; overflow: hidden; border: 1px solid #334155;">
      <div style="background: ${isApproved ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'}; padding: 24px; text-align: center;">
        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: bold;">⚡ PULSEFORGE</h1>
        <p style="margin: 6px 0 0; color: #f8fafc; font-size: 14px;">Trainer Application Update</p>
      </div>
      <div style="padding: 28px;">
        <p style="font-size: 16px; color: #cbd5e1;">Hello <strong style="color: #f8fafc;">${userName}</strong>,</p>
        <p style="font-size: 15px; color: #94a3b8; line-height: 1.6;">Your application to become a certified PulseForge trainer has been reviewed by the administration.</p>
        
        <div style="background: #1e293b; border-radius: 8px; padding: 18px; margin: 20px 0; border: 1px solid #334155;">
          <p style="margin: 0; font-size: 15px;"><strong style="color: #cbd5e1;">Review Status:</strong> <span style="color: ${isApproved ? '#34d399' : '#f87171'}; font-weight: bold; text-transform: uppercase;">${status}</span></p>
          ${feedback ? `<p style="margin: 12px 0 0; font-size: 14px; color: #94a3b8;"><strong style="color: #cbd5e1;">Admin Feedback:</strong> "${feedback}"</p>` : ''}
        </div>

        ${isApproved ? '<p style="font-size: 14px; color: #34d399;">Congratulations! Your account has been upgraded to <strong>Trainer</strong>. You can now access the Trainer Dashboard to create classes and engage with students.</p>' : '<p style="font-size: 14px; color: #94a3b8;">You may refine your qualifications based on the feedback and submit a new application from your dashboard anytime.</p>'}
      </div>
    </div>
  `;
}

module.exports = {
  sendPulseForgeEmail,
  getBookingConfirmationEmailTemplate,
  getTrainerApplicationReviewEmailTemplate,
};
