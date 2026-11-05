#!/usr/bin/env python3
"""Search Gmail for email to bilal@niete.edu.pk with attachments mentioning camera/mic"""

import json
import base64
from google.auth.transport.requests import Request
from google.oauth2.service_account import Credentials
from google.auth.oauthlib.flow import InstalledAppFlow
import google.auth.transport.requests
from googleapiclient.discovery import build

# Gmail API scopes
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def authenticate_gmail():
    """Authenticate with Gmail API"""
    try:
        # Try to load credentials from the file
        creds = None
        credentials_file = r'C:\Raftar\secrets\google-oauth-client.json'

        # Load the OAuth2 credentials
        flow = InstalledAppFlow.from_client_secrets_file(
            credentials_file, SCOPES)
        creds = flow.run_local_server(port=0)

        return build('gmail', 'v1', credentials=creds)
    except Exception as e:
        print(f"Authentication error: {e}")
        return None

def search_emails(service, query):
    """Search for emails matching the query"""
    try:
        results = service.users().messages().list(userId='me', q=query).execute()
        messages = results.get('messages', [])
        return messages
    except Exception as e:
        print(f"Search error: {e}")
        return []

def get_email_details(service, message_id):
    """Get full details of an email"""
    try:
        message = service.users().messages().get(userId='me', id=message_id, format='full').execute()
        return message
    except Exception as e:
        print(f"Error getting message details: {e}")
        return None

def extract_email_info(message):
    """Extract useful info from email"""
    headers = message['payload']['headers']
    subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
    sender = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
    date = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown')

    # Check for attachments
    has_attachments = 'parts' in message['payload']
    attachments = []
    if has_attachments:
        for part in message['payload']['parts']:
            if part['filename']:
                attachments.append(part['filename'])

    # Get body
    body = ""
    if 'parts' in message['payload']:
        for part in message['payload']['parts']:
            if part['mimeType'] == 'text/plain':
                data = part['body'].get('data', '')
                if data:
                    body = base64.urlsafe_b64decode(data).decode('utf-8')
                break
    else:
        data = message['payload']['body'].get('data', '')
        if data:
            body = base64.urlsafe_b64decode(data).decode('utf-8')

    return {
        'subject': subject,
        'from': sender,
        'date': date,
        'has_attachments': has_attachments,
        'attachments': attachments,
        'body_preview': body[:200] if body else ""
    }

def main():
    print("Authenticating with Gmail...")
    service = authenticate_gmail()

    if not service:
        print("Failed to authenticate")
        return

    # Search for emails to bilal@niete.edu.pk
    query = 'to:bilal@niete.edu.pk has:attachment'
    print(f"\nSearching for: {query}")

    messages = search_emails(service, query)

    if not messages:
        print("No emails found with attachments to bilal@niete.edu.pk")
        return

    print(f"\nFound {len(messages)} email(s):\n")

    for idx, message in enumerate(messages, 1):
        msg_id = message['id']
        email_data = get_email_details(service, msg_id)

        if email_data:
            info = extract_email_info(email_data)
            print(f"Email #{idx}")
            print(f"  Subject: {info['subject']}")
            print(f"  From: {info['from']}")
            print(f"  Date: {info['date']}")
            print(f"  Attachments: {', '.join(info['attachments']) if info['attachments'] else 'None'}")
            print(f"  Body Preview: {info['body_preview']}")
            print()

if __name__ == '__main__':
    main()
