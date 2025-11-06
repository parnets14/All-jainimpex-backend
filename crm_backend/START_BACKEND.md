# How to Start Backend Server

## Quick Start

1. **Open a new terminal**
2. **Navigate to backend folder:**
   ```bash
   cd JainInpexCRMBackend/crm_backend
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Wait for this message:**
   ```
   🎯 Server running on port 10000
   ```

5. **Keep this terminal open** - Don't close it!

## Verify It's Running

Open your browser and go to:
```
http://localhost:10000/api/app
```

You should see API information or a JSON response.

## Troubleshooting

### If MongoDB connection fails:
- Make sure MongoDB is running
- Check `.env` file has correct MongoDB connection string

### If port already in use:
- Another process is using port 10000
- Kill it or change PORT in `.env`

### If you see errors:
- Check the error message
- Make sure all dependencies are installed: `npm install`

## Keep Backend Running

**IMPORTANT:** The backend must be running while you use the app!

- Keep the terminal window open
- Don't press Ctrl+C (that stops the server)
- If you close it, restart with `npm start`



