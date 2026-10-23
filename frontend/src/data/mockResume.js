// MOCK DATA — sample "extracted" profile returned by the simulated resume
// parser (services/resumeService.js). The person, companies and college are
// fictional. Dates are "YYYY-MM"; endDate null means "Present".

export const mockExtractedProfile = {
  fullName: 'Riya Sharma',
  email: 'riya.sharma@example.com',
  countryCode: '+91',
  phone: '9876543210',
  currentRole: 'Full Stack Developer',
  currentLocation: 'Pune, Maharashtra, India',
  preferredLocations: ['Bengaluru, Karnataka, India'],
  experienceYears: '2',
  experienceMonths: '7',
  currentCompany: 'Northwind Tech',
  experiences: [
    { id: 'exp-1', title: 'Full Stack Developer', company: 'Northwind Tech', startDate: '2026-04', endDate: null },
    { id: 'exp-2', title: 'Full Stack Developer', company: 'Bluepeak Labs', startDate: '2025-08', endDate: '2026-04' },
    { id: 'exp-3', title: 'Frontend Developer', company: 'Lumen Retail', startDate: '2024-11', endDate: '2025-08' },
    { id: 'exp-4', title: 'Software Developer Intern', company: 'Orbitron Systems', startDate: '2024-03', endDate: '2024-11' },
  ],
  education: [
    {
      id: 'edu-1',
      institution: 'Example Institute of Technology, Pune',
      degree: 'B.E.',
      field: 'Computer Engineering',
      startYear: '2020',
      endYear: '2024',
    },
  ],
};
