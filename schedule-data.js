// Schedule data for Trails Coffee
const SCHEDULE_DATA = {
    startDate: '2026-02-09',
    shopHours: '8:00 AM - 4:00 PM',
    rotation: {
        'weekA': {
            label: 'Week A',
            pattern: {
                monday: { lead: 'Charlene', helpers: ['Ruby (4 PM+)'] },
                tuesday: { lead: 'Charlene', helpers: [] },
                wednesday: { lead: 'Charlene', helpers: ['Amanda'] },
                thursday: { lead: 'Diana', helpers: ['Ruby (4 PM+)', 'Amanda'] },
                friday: { lead: 'Diana', helpers: ['Aziza (after school)', 'Amanda'] },
                saturday: { lead: 'Charlene', helpers: ['Ruby', 'Aziza', 'Amanda'] },
                sunday: { lead: 'Charlene', helpers: ['Aziza'] }
            }
        },
        'weekB': {
            label: 'Week B',
            pattern: {
                monday: { lead: 'Diana', helpers: ['Ruby (4 PM+)'] },
                tuesday: { lead: 'Diana', helpers: [] },
                wednesday: { lead: 'Diana', helpers: ['Amanda'] },
                thursday: { lead: 'Charlene', helpers: ['Ruby (4 PM+)', 'Amanda'] },
                friday: { lead: 'Charlene', helpers: ['Aziza (after school)', 'Amanda'] },
                saturday: { lead: 'Diana', helpers: ['Ruby', 'Aziza', 'Amanda'] },
                sunday: { lead: 'Diana', helpers: ['Aziza'] }
            }
        }
    },
    exceptions: {
        '2026-02-15': { note: 'Aziza not available' }
    }
};
