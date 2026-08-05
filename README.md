# truedate-linkedin

A chrome extension to show original job posting dates

### API

Request made to: `https://www.linkedin.com/voyager/api/jobs/jobPostings/{jobID}`

- 1 request per job

Date listed at is in unix timestamp. Can be converted here: https://www.unixtimestamp.com/.

- Seconds since Jan 01 1970, UTC
- 1783546126000 -> Wed Jul 08 2026 21:28:46 GMT+0000

Response is huge, but important attributes:

```
{
    data: {
        applies: 0, // appears to be legacy, actual number no longer sent at this route
        originalListedAt: unixTimestamp,
        expireAt: unixTimestamp,
    },
    included: {} // info about your progress on application (things like resume submission, etc)
}


```
