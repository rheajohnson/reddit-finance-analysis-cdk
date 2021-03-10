import praw
import os
import regex as re
import time
import datetime
import boto3
import json
import data
import requests
from nltk.sentiment.vader import SentimentIntensityAnalyzer
import nltk
nltk.data.path.append('/tmp')
nltk.download('vader_lexicon', download_dir='/tmp')

'''############################################################################'''
# set the program parameters
subs = ['wallstreetbets', 'stocks', 'stockmarket']
p_upvote_ratio = 0.70
p_upvotes_min = 5
c_limit = 10
c_upvotes_min = 2
top_count = 8
sentiment_count = 8
'''############################################################################'''

p_analyzed, c_analyzed, comments, all_tickers = 0, 0, {}, {}


def get_tickers(sub, stockList):
    global p_analyzed, c_analyzed
    reddit = praw.Reddit(
        client_id=os.getenv('REDDIT_ID'),
        client_secret=os.getenv('REDDIT_SECRET'),
        user_agent=os.getenv('REDDIT_USER_AGENT'),
    )
    regex_pattern = r'\b([A-Z]+)\b'
    ticker_dict = stockList
    for submission in reddit.subreddit(sub).hot():
        # checking: post upvote ratio, # of upvotes
        if submission.upvote_ratio >= p_upvote_ratio and submission.ups > p_upvotes_min:
            submission.comment_sort = 'new'
            strings = [submission.title]
            # getting additional comments from comment tree
            try:
                submission.comments.replace_more(limit=c_limit)
            except Exception as e:
                print(e)
                submission.comments.replace_more(limit=0)
            p_analyzed += 1
            for comment in submission.comments.list():
                c_analyzed += 1
                # checking: comment upvotes
                if comment.score > c_upvotes_min:
                    strings.append(comment.body)
            # identifying tickers in strings and adding to comments dict for later sentiment analysis
            for s in strings:
                for phrase in re.findall(regex_pattern, s):
                    if phrase not in data.blacklist and phrase in ticker_dict:
                        if phrase not in all_tickers:
                            all_tickers[phrase] = 1
                            comments[phrase] = [s]
                        else:
                            all_tickers[phrase] += 1
                            comments[phrase].append(s)


def update_analysis_data(analysis_data):
    session = requests.Session()
    json_query = {
        "query": '''
            mutation ($analysisData: UpdateAnalysisDataInput!) {
                updateAnalysisData(analysisData: $analysisData)  {
                    topSentiment
                    topMention
                    totalComments
                    totalPosts
                    totalSubreddits
                    timestamp
                }
            }
        ''',
        "variables": {
            "analysisData": analysis_data
        }
    }
    response = session.post(
        url=os.environ['GRAPHQL_API_ENDPOINT'],
        headers={'x-api-key': os.environ['GRAPHQL_API_KEY']},
        json=json_query
    )
    print(response.text)


def get_secret(aws_secret_name):
    region_name = os.getenv('AWS_REGION')
    secrets_client = boto3.client('secretsmanager', region_name)
    return secrets_client.get_secret_value(
        SecretId=aws_secret_name
    )


def lambda_handler(event, lambda_context):
    start_time = time.time()

    # Resetting global variables due to lambda cache
    global p_analyzed, c_analyzed, comments, all_tickers
    p_analyzed, c_analyzed, comments, all_tickers = 0, 0, {}, {}

    # get secret values from aws and set to environment
    secret_response = get_secret(os.environ['AWS_SECRET_NAME'])
    secret_dict = json.loads(secret_response['SecretString'])
    for key in secret_dict.keys():
        if key not in os.environ:
            os.environ[key] = secret_dict[key]

    # crawl comments of posts in subs and build all_comments for sentiment analysis, and all_tickers for most mentioned
    for sub in subs:
        get_tickers(sub, data.tickers)

    # sort the dictionary
    tickers_ordered = dict(
        sorted(all_tickers.items(), key=lambda item: item[1], reverse=True))
    top_tickers = list(tickers_ordered.keys())[0:top_count]

    # get top symbols with counts
    top_mention_analysis = {}
    for i in top_tickers:
        top_mention_analysis[i] = tickers_ordered[i]

    # print top picks
    print(f'Top tickers identified:\n{top_mention_analysis}\n')

    # Applying Sentiment Analysis
    sentiment_analysis = {}

    vader = SentimentIntensityAnalyzer()
    # adding custom words from data.py
    vader.lexicon.update(data.sentiment_words)

    sentiment_picks = list(tickers_ordered.keys())[0:sentiment_count]

    for symbol in sentiment_picks:
        stock_comments = comments[symbol]
        for comment in stock_comments:
            score = vader.polarity_scores(comment)
            if symbol in sentiment_analysis:
                for key in score.keys():
                    sentiment_analysis[symbol][key] += score[key]
            else:
                sentiment_analysis[symbol] = score
        # calculating avg.
        for key in score:
            sentiment_analysis[symbol][key] = round(sentiment_analysis[symbol][key] /
                                                    len(stock_comments), 2)

    run_time = round(time.time() - start_time)

    # print sentiment
    print(f'Sentiment analysis:\n{sentiment_analysis}\n')

    analysis_data = {
        "topSentiment": json.dumps(sentiment_analysis),
        "topMention": json.dumps(top_mention_analysis),
        "totalComments": c_analyzed,
        "totalPosts": p_analyzed,
        "totalSubreddits": len(subs),
        "timestamp": str(datetime.datetime.now())
    }

    update_analysis_data(analysis_data)
    print(f'It took {run_time} seconds to analyze {c_analyzed} comments in {p_analyzed} posts in {len(subs)} subreddits.')
